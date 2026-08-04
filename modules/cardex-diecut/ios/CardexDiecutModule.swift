import CoreImage
import ExpoModulesCore
import Vision

/**
 * The free sticker: the player's own car lifted off its background and given a
 * die-cut white edge, on the device, in a couple of hundred milliseconds.
 *
 * This is the same subject lift as long-pressing an object in Photos —
 * `VNGenerateForegroundInstanceMaskRequest`, iOS 17+, on-device, free, offline,
 * and needing no new permission. It is deliberately *not* VisionKit's
 * `ImageAnalysisInteraction`, which is the only thing the npm wrappers expose:
 * that one is driven by a long-press gesture and does not guarantee a bitmap
 * even then, so it cannot run automatically at the end of a scan.
 *
 * What the model used to be asked for in prose — "centred, filling most of the
 * frame with a small even margin" — is arithmetic here, so it is exact on every
 * car instead of hoped for. That is the one place where removing the model buys
 * quality rather than spending it.
 */
public class CardexDiecutModule: Module {
  /// Square, and the same size as the redrawn sticker so a grid mixing the two
  /// does not mix resolutions.
  private static let canvas: CGFloat = 1024
  /// The white edge, in canvas pixels — ~3% of the frame, the value the server
  /// prompt asks the image model for. Pinned in *canvas* space rather than as a
  /// fraction of the source photo, so two cars shot at different distances come
  /// back with the same edge.
  private static let border: CGFloat = 30
  /// Gap between the white edge and the frame, on all four sides.
  private static let margin: CGFloat = 48
  /// Vision's mask staircases on a diagonal, and a max filter would keep every
  /// step. Small enough to leave the silhouette alone, large enough to remove
  /// the jaggies.
  private static let softness: CGFloat = 1.6
  /// Below this, whatever Vision found is not a car.
  private static let minimumSubject: CGFloat = 24

  /// Expensive to build and safe to share; the work runs off the main thread on
  /// the queue `AsyncFunction` already provides.
  private let ciContext = CIContext(options: [.cacheIntermediates: false])

  public func definition() -> ModuleDefinition {
    Name("CardexDiecut")

    /**
     * Whether this device can lift a subject at all.
     *
     * Below iOS 17 there is no API, which is a fallback rather than a bug: the
     * caller keeps the photograph, exactly as it does when any other service is
     * missing.
     */
    Function("isAvailable") { () -> Bool in
      if #available(iOS 17.0, *) {
        return true
      }
      return false
    }

    /**
     * Writes the die-cut sticker for `sourceUri` to `destinationUri` and returns
     * where it landed.
     *
     * The caller owns the destination: file placement, naming and cleanup all
     * live in `src/services/photo.ts` for every other picture in the app, and
     * splitting that rule across a native module is how the two drift.
     */
    AsyncFunction("cutOut") { (sourceUri: String, destinationUri: String) -> [String: Any] in
      guard #available(iOS 17.0, *) else {
        throw UnsupportedVersionException()
      }
      guard let source = Self.fileURL(from: sourceUri),
            let destination = Self.fileURL(from: destinationUri) else {
        throw BadPathException()
      }
      // `applyOrientationProperty` rather than trusting the pixels: a photo that
      // carries its rotation in EXIF would be analysed sideways, and the mask
      // would come back for a car nobody can see.
      guard let photo = CIImage(contentsOf: source, options: [.applyOrientationProperty: true]) else {
        throw UnreadablePhotoException()
      }

      let subject = try self.liftSubject(from: photo)
      let sticker = self.composeSticker(from: subject)

      guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
            let png = self.ciContext.pngRepresentation(
              of: sticker,
              format: .RGBA8,
              colorSpace: colorSpace
            ) else {
        throw RenderFailedException()
      }

      try FileManager.default.createDirectory(
        at: destination.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try png.write(to: destination, options: .atomic)

      return ["uri": destination.absoluteString]
    }
  }

  /**
   * The car, cropped to itself, with everything else transparent.
   *
   * `generateMaskedImage(…croppedToInstancesExtent: true)` is doing two jobs at
   * once here, and that is why it beats `generateScaledMaskForImage`: it hands
   * back the subject already cut out *and* already cropped, so the bounding box
   * arrives as the image's own size. The alternative meant measuring the mask by
   * scanning its pixels back, which means picking a side for the row order — and
   * a wrong guess there mirrors the framing vertically on every photo, silently.
   */
  @available(iOS 17.0, *)
  private func liftSubject(from photo: CIImage) throws -> CIImage {
    let handler = VNImageRequestHandler(ciImage: photo, options: [:])
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])

    guard let observation = request.results?.first,
          !observation.allInstances.isEmpty else {
      throw NoSubjectException()
    }

    // Every instance, not the largest one: a car photographed head-on comes back
    // as several — body, wheels, a wing mirror — and keeping only the biggest
    // takes the wheels off.
    let buffer = try observation.generateMaskedImage(
      ofInstances: observation.allInstances,
      from: handler,
      croppedToInstancesExtent: true
    )

    let subject = CIImage(cvPixelBuffer: buffer)
    guard subject.extent.width >= Self.minimumSubject,
          subject.extent.height >= Self.minimumSubject else {
      throw NoSubjectException()
    }
    return Self.moveToOrigin(subject)
  }

  /**
   * Scales the subject to a fixed box, centres it, then grows a white edge out
   * of its own alpha.
   *
   * The order matters: the subject is placed on the full canvas *before* the
   * edge is grown, because a max filter cannot write outside the image it is
   * given — dilating first and compositing after would clip the edge flat
   * wherever the car reached the crop.
   */
  private func composeSticker(from subject: CIImage) -> CIImage {
    let frame = CGRect(x: 0, y: 0, width: Self.canvas, height: Self.canvas)
    let room = Self.canvas - 2 * (Self.margin + Self.border)
    let scale = room / max(subject.extent.width, subject.extent.height)

    // Lanczos rather than the default: the common case is a downscale from the
    // 1024px photo, and this is the wheels-and-grille detail that `quality: low`
    // taught us not to throw away.
    let resized = Self.moveToOrigin(
      subject.applyingFilter(
        "CILanczosScaleTransform",
        parameters: [kCIInputScaleKey: scale, kCIInputAspectRatioKey: 1.0]
      )
    )

    // Rounded, so the same car never lands on a half pixel and picks up a seam
    // of its own on one side only.
    let placed = resized.transformed(
      by: CGAffineTransform(
        translationX: ((Self.canvas - resized.extent.width) / 2).rounded(),
        y: ((Self.canvas - resized.extent.height) / 2).rounded()
      )
    )
    let onCanvas = placed.composited(over: CIImage(color: .clear).cropped(to: frame))

    // Alpha carries the silhouette; `CIMaskToAlpha` wants it as luminance, and
    // hands back white already premultiplied — which is the whole plate in one
    // filter, and the reason we do not build the white with a colour matrix.
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

    // Each blur grows the extent, so each one is cropped straight back: left
    // alone, the plate would bleed a grey halo along all four frame edges.
    let plate = silhouette
      .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: Self.softness])
      .cropped(to: frame)
      .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: Self.border])
      .cropped(to: frame)
      .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: Self.softness])
      .cropped(to: frame)
      .applyingFilter("CIMaskToAlpha")

    // Vision's alpha is already correct, so plain source-over is the whole
    // composition — no blend-with-mask, no second copy of the same silhouette.
    return onCanvas.composited(over: plate).cropped(to: frame)
  }

  private static func moveToOrigin(_ image: CIImage) -> CIImage {
    image.transformed(
      by: CGAffineTransform(translationX: -image.extent.origin.x, y: -image.extent.origin.y)
    )
  }

  private static func fileURL(from value: String) -> URL? {
    if value.hasPrefix("file://") {
      return URL(string: value)
    }
    return URL(fileURLWithPath: value)
  }
}

internal final class UnsupportedVersionException: Exception {
  override var reason: String {
    "Lifting a subject needs iOS 17 or later"
  }
}

internal final class BadPathException: Exception {
  override var reason: String {
    "Source or destination is not a usable file path"
  }
}

internal final class UnreadablePhotoException: Exception {
  override var reason: String {
    "Could not read the photograph"
  }
}

internal final class NoSubjectException: Exception {
  override var reason: String {
    "No subject found in the photograph"
  }
}

internal final class RenderFailedException: Exception {
  override var reason: String {
    "Could not encode the sticker"
  }
}
