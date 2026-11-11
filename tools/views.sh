#!/bin/bash
# Capture the standard set of views in one go (after tools/build.sh and tools/serve.sh).
#   tools/views.sh [name filter]
# Look at the PNGs in tools/out/ afterwards. Add a line here when you build something new.
. "$(dirname "$0")/common.sh"
shot() { case "$1" in *"$FILTER"*) "$TOOLS_DIR/shot.sh" "$@";; esac; }
FILTER="${1:-}"
shot room-day        "quality=high&look=-0.2,-0.5&pos=-0.6,0,1.0"
shot room-table      "quality=high&look=-0.62,0.05&pos=0.12,-0.55,-0.25"
shot room-left       "quality=high&look=-0.1,1.35&pos=-0.6,0,0.4"
shot room-back       "quality=high&look=-0.05,2.7&pos=0,0,-0.2"
shot room-striker    "quality=high&look=0.05,-2.35&pos=0.5,0,0.9"
shot room-bowling    "quality=high&look=-0.45,-1.2&pos=1.2,0,0.6"
shot room-mole       "quality=high&look=-0.45,1.9&pos=-1.1,0,1.2"
shot room-xylo       "quality=high&look=-0.6,1.5&pos=-1.0,0,0.05"
shot room-hoop       "quality=high&look=0.15,1.2&pos=-1.2,0,-0.9"
shot room-plant      "quality=high&look=-0.25,-0.75&pos=1.6,0,-1.6"
shot room-night      "quality=high&dbg=night&look=-0.1,-0.45&pos=-0.5,0,0.9"
shot room-low        "quality=low&look=-0.25,0.3&pos=0.4,0,0.9"
shot gallery-lounge  "quality=high&dbg=gallery,bakefast&look=-0.1,-0.9&pos=-301.5,0,1.2"
shot gallery-desk    "quality=high&dbg=gallery,bakefast&look=-0.15,2.3&pos=-298.5,0,-1.2"
shot gallery-window  "quality=high&dbg=gallery,bakefast&look=-0.12,3.4&pos=-299.5,0,-1.6"
shot gallery-floor   "quality=high&dbg=gallery,bakefast&look=-0.32,2.9&pos=-299.2,0,-2.2"
shot gallery-chair   "quality=high&dbg=gallery,bakefast&look=-0.3,2.5&pos=-301.5,0,-0.6"
shot gallery-sofa    "quality=high&dbg=gallery,bakefast&look=-0.22,-0.35&pos=-298.6,0,-0.4"
shot gallery-night   "quality=high&dbg=gallery,bakefast,night&look=-0.1,-0.9&pos=-301.5,0,1.2"
shot arena-stump     "quality=high&dbg=monke&look=0.1,0"
shot arena-outside   "quality=high&dbg=monke&look=0.05,-0.9&pos=13,2,-13"
