fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios build

```sh
[bundle exec] fastlane ios build
```

Build iOS app

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Build and upload to TestFlight

### ios release

```sh
[bundle exec] fastlane ios release
```

Build and upload to App Store

----


## Android

### android build_aab

```sh
[bundle exec] fastlane android build_aab
```

Build Android AAB for Play Store

### android beta

```sh
[bundle exec] fastlane android beta
```

Deploy to Google Play Beta (Internal Testing)

### android release

```sh
[bundle exec] fastlane android release
```

Deploy to Google Play Production

### android increment_version

```sh
[bundle exec] fastlane android increment_version
```

Increment version code

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
