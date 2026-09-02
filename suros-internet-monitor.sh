#!/bin/bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTAGE_LOG_FILE="${OUTAGE_LOG_FILE:-$DIR/backend/logs/suros-outages.log}"
CHECK_INTERVAL=10
CONFIRM_THRESHOLD=3

mkdir -p "$(dirname "$OUTAGE_LOG_FILE")"

up_streak=0
down_streak=0
last_state="online"

log_event() {
    local event_type=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    mkdir -p "$(dirname "$OUTAGE_LOG_FILE")"
    echo "$timestamp | $event_type | $message" >> "$OUTAGE_LOG_FILE"
}

is_internet_reachable() {
    if timeout 3 bash -c "echo > /dev/tcp/1.1.1.1/53" 2>/dev/null; then
        return 0
    fi
    if timeout 3 bash -c "echo > /dev/tcp/8.8.8.8/53" 2>/dev/null; then
        return 0
    fi
    return 1
}

while true; do
    if is_internet_reachable; then
        up_streak=$((up_streak + 1))
        down_streak=0
        if [ $up_streak -eq $CONFIRM_THRESHOLD ] && [ "$last_state" = "offline" ]; then
            log_event "RECOVERY" "Internet connectivity restored"
            last_state="online"
        fi
    else
        down_streak=$((down_streak + 1))
        up_streak=0
        if [ $down_streak -eq $CONFIRM_THRESHOLD ] && [ "$last_state" != "offline" ]; then
            log_event "OUTAGE" "Internet connectivity lost"
            last_state="offline"
        fi
    fi
    sleep $CHECK_INTERVAL
done
