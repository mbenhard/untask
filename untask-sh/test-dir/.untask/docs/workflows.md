# Workflows

## Task Lifecycle

Tasks move through columns defined in `config.yml`:

backlog → todo → in-progress → review → done

## Using Tags

Add tags to organize tasks:

```
untask add "Fix login bug" --status todo
untask status 1 doing
untask done 1
```

## Search

Find tasks and docs by keyword:

```
untask search "authentication"
```

## Repair

If task files get out of sync (e.g. manual edits), run:

```
untask repair
```
