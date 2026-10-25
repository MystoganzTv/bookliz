Pod::Spec.new do |s|
  s.name           = 'AirPlayButton'
  s.version        = '1.0.0'
  s.summary        = "Apple's AirPlay route picker for Bookliz"
  s.description    = "Wraps AVRoutePickerView so the audiobook player can send sound to AirPlay speakers, AirPods and Apple TV."
  s.author         = 'Mystodev'
  s.homepage       = 'https://github.com/mystodev/bookliz'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
