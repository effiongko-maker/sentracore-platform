# Master Data sheets (seed / schema)

Sheets are created automatically on first Apps Script access. No seed rows are loaded at runtime.

## Departments

| id | name | code | facilityId | status | description | createdAt | updatedAt |
|----|------|------|------------|--------|-------------|-----------|-----------|

ID prefix: `DEP-####`

## Buildings

| id | name | code | facilityId | status | description | createdAt | updatedAt |
|----|------|------|------------|--------|-------------|-----------|-----------|

ID prefix: `BLD-####`

## Floors

| id | name | code | facilityId | buildingId | level | status | description | createdAt | updatedAt |
|----|------|------|------------|------------|-------|--------|-------------|-----------|-----------|

ID prefix: `FLR-####`

## Rooms

| id | name | code | facilityId | buildingId | floorId | status | description | createdAt | updatedAt |
|----|------|------|------------|------------|---------|--------|-------------|-----------|-----------|

ID prefix: `RM-####`

## Vendors

| id | name | code | category | contactName | email | phone | status | description | createdAt | updatedAt |
|----|------|------|----------|-------------|-------|-------|--------|-------------|-----------|-----------|

ID prefix: `VND-####`

## API

```json
{
  "resource": "master-data",
  "action": "getAll",
  "payload": { "entity": "departments", "page": 1, "pageSize": 200 }
}
```

Entities: `departments` | `buildings` | `floors` | `rooms` | `vendors`
