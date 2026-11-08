// The semester this build is published for. Bump it (and re-freeze bench/golden.json) at
// the start of each term, then tag the commit with the same name:
//     git tag -a fall-2026 -m "Fall 2026 release" && git push --tags
// Every file the site exports carries the tag in its name (…field.fall-2026.csv), so a number
// in a lab report can be traced to the build that produced it.
export const SEMESTER = 'fall-2026';
