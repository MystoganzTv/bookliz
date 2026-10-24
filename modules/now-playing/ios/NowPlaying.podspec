Pod::Spec.new do |s|
  s.name           = 'NowPlaying'
  s.version        = '1.0.0'
  s.summary        = 'Now Playing skip intervals for Bookliz'
  s.description    = 'Sets the lock-screen skip intervals so they match the player instead of the fixed 10 s from expo-audio.'
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
