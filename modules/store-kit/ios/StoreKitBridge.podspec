Pod::Spec.new do |s|
  s.name           = 'StoreKitBridge'
  s.version        = '1.0.0'
  s.summary        = 'StoreKit 2 purchases for Bookliz Pro'
  s.description    = 'Loads products, buys, restores and reports verified entitlements with StoreKit 2.'
  s.author         = 'Mystodev'
  s.homepage       = 'https://github.com/mystodev/bookliz'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'StoreKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
