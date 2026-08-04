Pod::Spec.new do |s|
  s.name           = 'CardexDiecut'
  s.version        = '1.0.0'
  s.summary        = 'On-device die-cut sticker: subject lift plus a white edge.'
  s.description    = 'Lifts the car out of a garage photo with Vision and gives it a die-cut white edge in Core Image, so the free sticker costs nothing and lands in milliseconds.'
  s.author         = 'CarDex'
  s.homepage       = 'https://docs.expo.dev/modules/'
  # 16.4 matches the app. The Vision API this needs is iOS 17, and the module
  # answers `isAvailable() == false` below it rather than refusing to build.
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
