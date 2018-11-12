#!/bin/sh


if [ -f ~/bin/setup_node_env.sh ]; then
	. ~/bin/setup_node_env.sh
fi


# Default instance
NODE_APP_INSTANCE="general"

# extract options and their arguments into variables.
while getopts i: FLAG; do
	case $FLAG in
		i)
			NODE_APP_INSTANCE=$OPTARG
			;;
		\?) echo "Internal error! Unrecognized argument $FLAG" ; exit 1 ;;
	esac
done

export NODE_APP_INSTANCE


node index.js
