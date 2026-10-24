Pod::Spec.new do |s|
  s.name           = 'FileBackup'
  s.version        = '1.0.0'
  s.summary        = 'iCloud backup exclusion for Bookliz'
  s.description    = 'Sets isExcludedFromBackup on a folder so large user-imported audio does not fill the iCloud device backup.'
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
