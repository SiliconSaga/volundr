# Writes the CI-only config overlay for one visual-diff build.
#
# Usage: ruby ci-config.rb <site _config.yml> <out.yml>
#
# The overlay is _config.ci.yml with its plugins list widened to include the
# site's own. Jekyll layers --config files by REPLACING arrays, not merging
# them, so layering _config.ci.yml as-is would drop every plugin the site
# lists (jekyll-feed, jekyll-redirect-from, ...) and a layout using one of
# their tags ({% feed_meta %}) fails the build outright.
require "date"
require "yaml"

site_config, out = ARGV
abort "usage: ruby ci-config.rb <site _config.yml> <out.yml>" unless site_config && out

# Psych gained the keyword form in 3.1 (Ruby 2.6) and dropped the positional
# one in 4.0, so pick by version; CI runs Ruby 3.3, local boxes may not.
def load_yaml(path)
  text = File.read(path)
  data = if Gem::Version.new(Psych::VERSION) >= Gem::Version.new("3.1")
    YAML.safe_load(text, permitted_classes: [Date, Time], aliases: true)
  else
    YAML.safe_load(text, [Date, Time], [], true)
  end
  data || {}
end

overlay = load_yaml(File.join(__dir__, "_config.ci.yml"))
site = load_yaml(site_config)
overlay["plugins"] = Array(site["plugins"]) | Array(overlay["plugins"])
File.write(out, overlay.to_yaml)
