// Package migrations embeds the ordered SQL migration files so the migration
// runner is independent of the process working directory.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
