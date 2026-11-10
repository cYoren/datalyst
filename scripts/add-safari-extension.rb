# One-off: adds the DatalystSafari app extension (Safari quick log, same files as the Chrome one) to the iOS app.
# Run on the Mac: ruby scripts/add-safari-extension.rb   (needs the xcodeproj gem from CocoaPods)
require 'xcodeproj'
project = Xcodeproj::Project.open(File.expand_path('../ios/App/App.xcodeproj', __dir__))
abort 'already added' if project.targets.any? { |t| t.name == 'DatalystSafari' }
app = project.targets.find { |t| t.name == 'App' }
release = app.build_configurations.find { |c| c.name == 'Release' }.build_settings
ext = project.new_target(:app_extension, 'DatalystSafari', :ios, app.deployment_target)
group = project.main_group.find_subpath('App', false) || project.main_group
group = group.new_group('DatalystSafari', 'DatalystSafari')
ext.add_file_references([group.new_file('SafariWebExtensionHandler.swift')])
group.new_file('Info.plist')
ext.build_configurations.each do |c|
  c.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.datalyst.app.safari', 'PRODUCT_NAME' => '$(TARGET_NAME)',
    'INFOPLIST_FILE' => 'App/DatalystSafari/Info.plist', 'GENERATE_INFOPLIST_FILE' => 'NO',
    'MARKETING_VERSION' => release['MARKETING_VERSION'], 'CURRENT_PROJECT_VERSION' => release['CURRENT_PROJECT_VERSION'],
    'DEVELOPMENT_TEAM' => release['DEVELOPMENT_TEAM'] || '2LPNFM9A89', 'CODE_SIGN_STYLE' => 'Automatic',
    'SWIFT_VERSION' => '5.0', 'TARGETED_DEVICE_FAMILY' => '1,2', 'SKIP_INSTALL' => 'YES',
    'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO')
end
copy = ext.new_shell_script_build_phase('Copy web extension')
copy.always_out_of_date = '1'
copy.shell_script = <<~SH
  set -e
  src="$SRCROOT/../../clients/chrome-extension"
  [ -f "$src/manifest.json" ] || { echo "error: clients/chrome-extension missing"; exit 1; }
  rsync -a "$src/" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/"
SH
app.add_dependency(ext)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
embed.add_file_reference(ext.product_reference).settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
project.save
puts "added DatalystSafari #{release['MARKETING_VERSION']} (#{release['CURRENT_PROJECT_VERSION']})"
