# Daily fleet card statement: AI agent

Every day, an AI agent takes the fleet card transactions from the fuel station
portal (Setel) and sends them to CMMS 2. CMMS 2 does the rest:

- saves each transaction **once**. Sending the same days again adds nothing twice, so
  the agent can safely send the last 3 days every time.
- puts it on the fleet card with that number (Fleet Card Manage);
- matches it with the driver's fuel claim receipt for the same fill (same card, same
  day or a day either side, amount within RM 0.10, or the same receipt number). It is
  counted once: on the claim when there is one, otherwise as **Not claimed yet**.
- shows it in Fleet Card Manage → the card → Usage, in My fleet card, the card balance
  and Fuel Usage Reports.

## One-time setup

1. Run the SQL `supabase/migrations/20261212120000_fleet_card_statement_import.sql` in
   the Machinery Portal database (Supabase project qcvbzzdbbqmnrljfnxjp).
2. Supabase → Edge Functions → Secrets → add `FLEET_IMPORT_KEY` with a long random
   value (32+ characters). Only the agent gets this key.
3. The `fleet-card-import` function deploys by itself from GitHub (Actions →
   "Deploy WhatsApp webhook") when this code is on `main`.
4. In Fleet Card Manage, every card must have its **full card number** as printed on the
   card. Setel may hide the middle digits (`7083 **** **** 9921`). That is fine if only
   one card ends with the visible digits.
5. Test the connection:
   `curl -H "x-api-key: <KEY>" https://qcvbzzdbbqmnrljfnxjp.supabase.co/functions/v1/fleet-card-import`
   It should answer `{"ok":true,...}`.

## Where the agent sends the data

```
POST https://qcvbzzdbbqmnrljfnxjp.supabase.co/functions/v1/fleet-card-import
x-api-key: <FLEET_IMPORT_KEY>
```

**Option A: the CSV file as exported from Setel** (easiest)

```
Content-Type: text/csv
<the file, unchanged>
```

Columns are found by their names, such as "Transaction Date/Time", "Transaction ID",
"Card Number", "Vehicle No.", "Station", "Product", "Volume (L)" and "Amount (RM)". A
title block above the header row is fine. Lines with no litres, such as a car wash or
shop items, are skipped.

**Option B: JSON** (when the agent reads the table on screen)

```json
{
  "source": "setel",
  "transactions": [
    {
      "txn_id": "TX20261121-000123",
      "card_no": "7083 1234 5678 9921",
      "date": "2026-11-21",
      "time": "17:40",
      "litres": 40.12,
      "amount": 86.26,
      "station": "Setel Kulai",
      "product": "Diesel B10",
      "vehicle": "JQX 88",
      "driver": "Joanne Goh",
      "receipt_no": "PT-55821"
    }
  ]
}
```

- **Required:** `txn_id`, `card_no`, `date`, `litres` and `amount`.
- Write dates as `YYYY-MM-DD` or `DD/MM/YYYY`, in Malaysia time.
- `txn_id` must be the portal's own transaction or reference number. It is what stops
  duplicates.
- `vehicle` and `driver` are optional. If the plate is a vehicle in Machinery Profile,
  that vehicle is used; otherwise it is the card's vehicle.
- A call can carry at most 3000 transactions and 3 MB.

**The answer**

```json
{ "received": 25, "added": 9, "duplicates": 15, "paired_with_claims": 6,
  "skipped_not_fuel": 1, "not_saved": 0, "problems": [] }
```

Each `problems` entry gives the row, the card number and the reason, for example
`Card not in Fleet Card Manage` or `Card number fits more than one card`. These rows are
not saved. Fix the card in Fleet Card Manage and the next daily run brings them in.

## Prompt for the scheduled agent (copy this)

> Every day at 7:00 am Malaysia time:
> 1. Sign in to the Setel fleet portal with the company fleet account.
> 2. Open the fleet card transactions and filter from 3 days ago to today.
> 3. Export the transactions as CSV. If export is not possible, read every row of the
>    table: transaction ID, date and time, card number, vehicle, station, product,
>    litres and amount (RM).
> 4. Send them to CMMS 2: POST to
>    `https://qcvbzzdbbqmnrljfnxjp.supabase.co/functions/v1/fleet-card-import` with the
>    header `x-api-key: <FLEET_IMPORT_KEY>`. Send the CSV file unchanged with
>    `Content-Type: text/csv`, or JSON `{"source":"setel","transactions":[...]}` in the
>    format above.
> 5. Read the answer. If `not_saved` is more than 0, or the call failed, send me a short
>    message with the problems list. Otherwise report "Fleet card statement: N new, M
>    matched to claims".
> 6. Never change anything in the Setel portal. Only read and export.

## By hand

Fleet Card Manage → **Import statement**, for people with Fleet Card Manage edit
rights. It takes the same CSV, imports it into the company that is open, and shows the
same result. The line under the page title shows the last import and whether anything
was not saved.
