# Dorm & Room API Testing Guide

This guide shows how to test the dorm and room endpoints using Postman or Insomnia. Replace `{{BASE_URL}}` with your server's base URL (e.g., http://localhost:3000/api/v1).

## Authentication
Most endpoints require authentication. Obtain a JWT token via the login endpoint and set it as a Bearer token in your requests.

---

## List All Dorms
- **Endpoint:** `GET /dorms`
- **Query Params:** `page`, `limit`, `active`, `genderRestriction`, etc.
- **Example:**
```
GET {{BASE_URL}}/dorms?page=1&limit=10
```

## Get Dorm Details
- **Endpoint:** `GET /dorms/:id/details`
- **Example:**
```
GET {{BASE_URL}}/dorms/REPLACE_DORM_ID/details
```

## List Rooms in a Dorm
- **Endpoint:** `GET /dorms/:id/rooms`
- **Query Params:** `status`, `occupancy`, `isActive`, `floorNumber`, etc.
- **Example:**
```
GET {{BASE_URL}}/dorms/REPLACE_DORM_ID/rooms?status=ACTIVE&occupancy=available
```

## List Beds in a Dorm
- **Endpoint:** `GET /dorms/:id/beds`
- **Query Params:** `status`, `roomId`, `isActive`, etc.
- **Example:**
```
GET {{BASE_URL}}/dorms/REPLACE_DORM_ID/beds?status=AVAILABLE
```

## Create a Room
- **Endpoint:** `POST /rooms`
- **Body:**
```
{
  "dormId": "REPLACE_DORM_ID",
  "roomNumber": "101A",
  "floorNumber": 1,
  "capacity": 4,
  "status": "ACTIVE"
}
```

## Update a Room
- **Endpoint:** `PUT /rooms/:id`
- **Body:** (any updatable fields)

## Common Notes
- Always set the `Authorization: Bearer <token>` header.
- Use valid UUIDs for IDs.
- For capacity, use integers between 1 and 10.
- Check response for `meta` (pagination) and data arrays.

---

Test with both valid and invalid data to verify validation and error handling.
