#!/usr/bin/env swift

// Builds a die-cut sticker on this Mac, outside the app.
//
// The onboarding demo (`app/onboarding.tsx`, step `demo`) ships its sticker as a
// bundled asset rather than cutting one out at runtime: it is shown *before* the
// player has given us a photo, so there is nothing to lift, and a demo whose
// picture depends on Vision succeeding on a dev-client build is a demo that is
// blank in Expo Go.
//
// So the asset has to be made somewhere, and it has to be made by the *same*
// arithmetic the app uses — a demo sticker with a different edge or margin than
// every real one is a demo that promises the wrong thing. Hence this file, which
// is a deliberate port of `composeSticker` / `liftSubject` from
// `modules/cardex-diecut/ios/CardexDiecutModule.swift`: same canvas, same 30px
// edge, same 48px margin, same Lanczos downscale, same two-blur plate.
//
// It is the one duplication of that algorithm in the repo, and it exists because
// the alternative is worse (a screenshot taken off a device, at whatever
// resolution that device had). After touching the module's constants or its
// composition, re-run this and commit the regenerated asset:
//
//   swift scripts/diecut-asset.swift <source-photo> <destination.png>

import CoreImage
import Foundation
import Vision

let canvas: CGFloat = 1024
let border: CGFloat = 30
let margin: CGFloat = 48
let softness: CGFloat = 1.6
let minimumSubject: CGFloat = 24

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("diecut-asset: \(message)\n".utf8))
  exit(1)
}

func moveToOrigin(_ image: CIImage) -> CIImage {
  image.transformed(
    by: CGAffineTransform(translationX: -image.extent.origin.x, y: -image.extent.origin.y)
  )
}

guard CommandLine.arguments.count == 3 else {
  fail("usage: swift scripts/diecut-asset.swift <source-photo> <destination.png>")
}
let source = URL(fileURLWithPath: CommandLine.arguments[1])
let destination = URL(fileURLWithPath: CommandLine.arguments[2])

guard let photo = CIImage(contentsOf: source, options: [.applyOrientationProperty: true]) else {
  fail("could not read \(source.path)")
}

// ── The subject, cropped to itself ──────────────────────────────────────────

let handler = VNImageRequestHandler(ciImage: photo, options: [:])
let request = VNGenerateForegroundInstanceMaskRequest()
do {
  try handler.perform([request])
} catch {
  fail("Vision failed: \(error)")
}

guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
  fail("no subject found — Vision saw nothing it could lift out of this photo")
}

// Every instance, not the largest: a car photographed head-on comes back as
// several, and keeping only the biggest takes the wheels off.
guard
  let buffer = try? observation.generateMaskedImage(
    ofInstances: observation.allInstances,
    from: handler,
    croppedToInstancesExtent: true
  )
else {
  fail("could not mask the subject")
}

let subject = moveToOrigin(CIImage(cvPixelBuffer: buffer))
guard subject.extent.width >= minimumSubject, subject.extent.height >= minimumSubject else {
  fail("subject is too small to be a car")
}

// ── The sticker ─────────────────────────────────────────────────────────────

let frame = CGRect(x: 0, y: 0, width: canvas, height: canvas)
let room = canvas - 2 * (margin + border)
let scale = room / max(subject.extent.width, subject.extent.height)

let resized = moveToOrigin(
  subject.applyingFilter(
    "CILanczosScaleTransform",
    parameters: [kCIInputScaleKey: scale, kCIInputAspectRatioKey: 1.0]
  )
)

let placed = resized.transformed(
  by: CGAffineTransform(
    translationX: ((canvas - resized.extent.width) / 2).rounded(),
    y: ((canvas - resized.extent.height) / 2).rounded()
  )
)
let onCanvas = placed.composited(over: CIImage(color: .clear).cropped(to: frame))

let silhouette = onCanvas.applyingFilter(
  "CIColorMatrix",
  parameters: [
    "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 1),
    "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 1),
    "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 1),
    "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0),
    "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 1),
  ]
)

let plate = silhouette
  .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: softness])
  .cropped(to: frame)
  .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: border])
  .cropped(to: frame)
  .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: softness])
  .cropped(to: frame)
  .applyingFilter("CIMaskToAlpha")

let sticker = onCanvas.composited(over: plate).cropped(to: frame)

let context = CIContext(options: [.cacheIntermediates: false])
guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
  let png = context.pngRepresentation(of: sticker, format: .RGBA8, colorSpace: colorSpace)
else {
  fail("could not encode the sticker")
}

do {
  try png.write(to: destination, options: .atomic)
} catch {
  fail("could not write \(destination.path): \(error)")
}

print("diecut-asset: wrote \(destination.path)")
