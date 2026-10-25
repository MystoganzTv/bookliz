Pod::Spec.new do |s|
  s.name           = 'ICloudAudio'
  s.version        = '1.0.0'
  s.summary        = 'Audiobooks in iCloud Drive for Bookliz'
  s.description    = 'Copies audiobook folders into the app iCloud container and brings them back on other devices.'
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
