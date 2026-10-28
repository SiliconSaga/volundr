# Writes the CI-only config overlay for one visual-diff build.
#
# Usage: bundle exec ruby ci-config.rb <site _config.yml> <out.yml>
#
# The overlay is _config.ci.yml with its plugins list widened to include the
# site's own. Jekyll layers --config files by REPLACING arrays, not merging
# them, so layering _config.ci.yml as-is would drop every plugin the site
# lists (jekyll-feed, jekyll-redirect-from, ...) and a layout using one of
# their tags ({% feed_meta %}) fails the build outright.
#
# Configs are read with Jekyll's own loader (SafeYAML), so anything the build
# accepts — `permalink: :title`, dates — parses here too; plain Psych rejects
# some of it. Hence `bundle exec`: the caller's bundle provides Jekyll.
require "jekyll"

site_config, out = ARGV
abort "usage: bundle exec ruby ci-config.rb <site _config.yml> <out.yml>" unless site_config && out

def load_yaml(path)
  Jekyll::Configuration.new.safe_load_file(path) || {}
end

overlay = load_yaml(File.join(__dir__, "_config.ci.yml"))
site = load_yaml(site_config)
overlay["plugins"] = Array(site["plugins"]) | Array(overlay["plugins"])
File.write(out, overlay.to_yaml)
