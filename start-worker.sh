#!/bin/bash
set -e
prefect deploy --all
exec prefect worker start --pool personal-data-hub-pool
