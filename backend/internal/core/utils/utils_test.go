package utils

import "testing"

func TestContains(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		s    string
		want bool
	}{
		{"present in middle", []string{"a", "b", "c"}, "b", true},
		{"present at start", []string{"a", "b"}, "a", true},
		{"present at end", []string{"a", "b"}, "b", true},
		{"absent", []string{"a", "b"}, "z", false},
		{"empty slice", nil, "a", false},
		{"empty target against empty element", []string{""}, "", true},
		{"case sensitive", []string{"A"}, "a", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Contains(tc.in, tc.s); got != tc.want {
				t.Fatalf("Contains(%v, %q) = %v, want %v", tc.in, tc.s, got, tc.want)
			}
		})
	}
}
