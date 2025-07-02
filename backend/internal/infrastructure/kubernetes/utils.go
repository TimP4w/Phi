package kubernetes

import (
	"strings"
	"time"
)

/*
Copyright 2024 gimlet-io

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
Original version: https://github.com/gimlet-io/capacitor/blob/12b1b8d48edbda8f0b71a7442163352064fe793c/pkg/logs/logs.go
*/

// chunks splits a string into chunks of a specified size.
func chunks(str string, size int) []string {
	if len(str) <= size {
		return []string{str}
	}
	return append([]string{string(str[0:size])}, chunks(str[size:], size)...)
}

// parseMessage parses a log message chunk into a timestamp and the actual message.
func parseMessage(chunk string) (time.Time, string) {
	parts := strings.SplitN(chunk, " ", 2)

	if len(parts) != 2 {
		return time.Time{}, parts[0]
	}

	timestamp, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, chunk
	}
	return timestamp, parts[1]
}
