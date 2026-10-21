# Snippet to merge into the existing .gitignore

Do not overwrite the entire `.gitignore`. Merge this snippet with existing rules and verify that `local-samples/` is not already tracked.

```gitignore
# Private broker statements — never commit
/local-samples/**
!/local-samples/README.md
```

You may keep empty `.gitkeep` files if you need local directory structure, but do not commit real reports.

Adding an ignore rule does not remove files that Git already tracks. If a report was staged or committed previously, remove it from the index and inspect repository history. Treat accidental pushes of sensitive reports as a privacy incident.
