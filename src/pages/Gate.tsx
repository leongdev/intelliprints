import { useState } from "react";
import { useWorkshop } from "../context/Workshop";
import { Field, FormError, submit } from "../components/ui";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "BRL", "MXN"];

export function Gate() {
  const shop = useWorkshop();
  const [name, setName] = useState("Main workshop");
  const [currency, setCurrency] = useState("USD");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    setError("");
    try {
      await shop.createWorkspace(name, currency);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the workshop.");
    } finally {
      setPending(false);
    }
  }

  async function join() {
    setPending(true);
    setError("");
    try {
      await shop.joinWorkspace(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join that workshop.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <p className="lede">
        A workshop holds the spools, products, and print board for this machine.
      </p>
      <FormError message={error} />
      <div className="gate">
        <form className="panel stack" onSubmit={submit(() => void create())}>
          <div>
            <p className="kicker">New</p>
            <h2>Create a workshop</h2>
          </div>
          <Field label="Name">
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Currency" hint="Used for material spend. Prices are per kilogram.">
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {CURRENCIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <button className="btn primary" type="submit" disabled={pending}>
            Create workshop
          </button>
        </form>
        <form className="panel stack" onSubmit={submit(() => void join())}>
          <div>
            <p className="kicker">Existing</p>
            <h2>Join with a code</h2>
          </div>
          <Field label="Join code" hint="Ask the workshop owner. Codes look like K7MQ2P.">
            <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} required minLength={4} />
          </Field>
          <button className="btn ghost" type="submit" disabled={pending}>
            Join workshop
          </button>
        </form>
      </div>
    </div>
  );
}
