# IntelliPrints

Shared workshop app for 3D-print filament, products, and a kanban that sequences plates against the plastic you actually have.

React + Vite in the browser. PocketBase stores accounts, workshops, and every gram.

## Run it

```bash
npm install
npm run setup          # downloads PocketBase and creates a local superuser
npm run pocketbase     # terminal 1
npm run bootstrap      # once PocketBase is up
npm run dev            # terminal 2
```

Open http://127.0.0.1:5173. The PocketBase admin UI is at http://127.0.0.1:8090/_/ (`admin@intelliprints.local` / `intelli-admin`). That password is for this local database only.

Anyone on the same Wi-Fi can open the app. Run `npm run lan` to print the address, then use that `http://<this-computer>:5173` link on the other device. The page proxies PocketBase, so only port 5173 needs to be reachable. A save on one screen shows up on the others. Stock changes and job moves are applied one at a time, so two people cannot overwrite the same spool or start the same plate twice.

## How a workshop is organized

- **Accounts.** Email and password. Each person signs in as themselves.
- **Workshops.** The owner gets a join code. Another account enters it and sees the same spools, products, board, and logs.
- **Printers.** One live card per machine. Split a queued card when you want the same part on two printers.
- **Filaments.** Brand, material (PLA, PETG, and the usual others), color, grams left, price per kg, and a reorder threshold.
- **Products.** Pieces and plates, each with grams, minutes, how many go into one finished unit, and a spool from the workshop.
- **Milestones.** “10 of product A” expands into kanban cards.
- **Print board.** Queue, Printing, Done, Failed. Drag a card, or use the buttons on it.
- **Analytics.** Good/bad piece ratio, grams used, grams wasted, money spent, and a CSV of the log.

## Print order

When a milestone is saved, the planner:

1. Subtracts plastic already promised to other queued or printing cards.
2. Groups the remaining plates by spool and prints the **scarcest spool first** (demand ÷ grams free), so a shortage shows up before the printer is busy with an easy material.
3. On that spool, runs the **longest plate first**, so you pay the changeover once and don’t leave the slow job until the end.
4. If a plate doesn’t fit, it becomes a **blocked** card instead of a print that would run out mid-way.

Restocking a spool clears the block when the grams cover the next card. **Replan queue** rebuilds the order from whatever is still unfinished. Cards already printing stay where they are.

Finishing a card subtracts the grams you enter. Failing one records the wasted grams, keeps any salvaged pieces, and leaves the rest to reprint. Both write a log entry that analytics uses, at the spool price from that moment.

Notifications fire when a spool is empty, short of the queue, under its reorder line, or when a milestone is fully assembled.
