Pod::Spec.new do |s|
  s.name           = 'AppIcon'
  s.version        = '1.0.0'
  s.summary        = 'Alternate app icons for Bookliz'
  s.description    = 'Switches the home-screen icon between the asset-catalog alternates.'
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
