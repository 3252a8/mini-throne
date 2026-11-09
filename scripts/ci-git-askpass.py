#!/usr/bin/env python3
"""Credentials are piped directly to Git; never place them in remote URLs."""

import os
import sys

prompt = sys.argv[1].lower()
if "username" in prompt:
    print("oauth2" if "gitlab.com" in prompt else "x-access-token")
else:
    print(
        os.environ["MINI_THRONE_GITLAB_TOKEN" if "gitlab.com" in prompt else "GH_TOKEN"]
    )
