# Homebrew Distribution

## Setting Up a Custom Tap

1. Create a new GitHub repo: `mbenhard/homebrew-untask`
2. Add a formula file `Casks/untask.rb`:

```ruby
cask "untask" do
  version "0.1.0"
  sha256 "REPLACE_WITH_SHA256"

  url "https://github.com/mbenhard/untask/releases/download/v#{version}/Untask-#{version}-mac.zip"
  name "Untask"
  desc "Local-first personal task manager with optional AI assistant"
  homepage "https://github.com/mbenhard/untask"

  app "Untask.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Untask.app"],
                   sudo: false
  end
end
```

3. Users install with:
```bash
brew tap mbenhard/untask
brew install --cask untask
```

## Updating the Formula
After each release:
1. Update `version` in the formula
2. Download the new ZIP, run `shasum -a 256 Untask-X.Y.Z-mac.zip`
3. Update `sha256` in the formula
4. Commit and push to the tap repo
