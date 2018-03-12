#!/bin/sh

. ~/bin/setup_node_env.sh

export NODE_ENV="test"

mocha -b --check-leaks --recursive test/unit
mocha -b --check-leaks --recursive test/functional
