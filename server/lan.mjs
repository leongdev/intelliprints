import { networkInterfaces } from "node:os";

const port = 5173;
const addresses = [];
for (const entries of Object.values(networkInterfaces())) {
  for (const entry of entries ?? []) {
    if (entry.internal || entry.family !== "IPv4") continue;
    addresses.push(entry.address);
  }
}

console.log("IntelliPrints is shared on this network.");
console.log(`This computer: http://127.0.0.1:${port}`);
if (addresses.length === 0) {
  console.log("No other IPv4 address found. Check Wi-Fi, then run this again.");
} else {
  for (const address of addresses) console.log(`Other devices: http://${address}:${port}`);
}
console.log("PocketBase stays on this computer. Phones and laptops use the app address above.");
console.log("A change on one screen shows up on the others. Saves wait their turn so two people cannot overwrite the same job or spool.");
