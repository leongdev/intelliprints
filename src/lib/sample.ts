import type PocketBase from "pocketbase";
import { plannedCardFields } from "./cards";
import { lineForPart, planPrints, stockForPlanning } from "./logistics";
import { jobsFor } from "./metrics";
import { mapCard, mapFilament, mapPart } from "./mappers";

interface Created {
  collection: string;
  id: string;
}

export async function seedWorkshop(pb: PocketBase, workspaceId: string) {
  const existing = await pb.collection("filaments").getList(1, 1, {
    filter: `workspace = "${workspaceId}"`,
  });
  if (existing.totalItems > 0) {
    throw new Error("Sample data only loads into a workshop with no spools yet.");
  }

  const created: Created[] = [];
  const track = async (collection: string, body: Record<string, unknown>) => {
    const record = await pb.collection(collection).create(body);
    created.push({ collection, id: record.id });
    return record;
  };

  try {
    const pla = await track("filaments", {
      workspace: workspaceId,
      brand: "Bambu Lab",
      material: "PETG Basic",
      color: "Black(30105)",
      colorHex: "#000000",
      remainingGrams: 780,
      spoolGrams: 1000,
      pricePerKg: 22,
      lowThresholdGrams: 200,
      notes: "Main black PETG Basic for rigid clips.",
    });
    const petg = await track("filaments", {
      workspace: workspaceId,
      brand: "Bambu Lab",
      material: "PETG Basic",
      color: "White(30106)",
      colorHex: "#FFFFFF",
      remainingGrams: 70,
      spoolGrams: 1000,
      pricePerKg: 28,
      lowThresholdGrams: 200,
      notes: "Running low on purpose so the planner can block plates.",
    });
    const plaPlus = await track("filaments", {
      workspace: workspaceId,
      brand: "Bambu Lab",
      material: "PETG Basic",
      color: "Orange(30301)",
      colorHex: "#FF671F",
      remainingGrams: 940,
      spoolGrams: 1000,
      pricePerKg: 18,
      lowThresholdGrams: 200,
      notes: "",
    });

    const clip = await track("products", {
      workspace: workspaceId,
      name: "Desk cable clip",
      description: "Small clip that holds a charging cable along a desk edge.",
    });
    const stand = await track("products", {
      workspace: workspaceId,
      name: "Headphone stand",
      description: "Base, two arms, and a pair of PETG pads.",
    });

    const clipVersion = await track("product_versions", {
      workspace: workspaceId,
      product: clip.id,
      name: "v1",
      notes: "",
      active: true,
    });
    const standVersion = await track("product_versions", {
      workspace: workspaceId,
      product: stand.id,
      name: "v1",
      notes: "",
      active: true,
    });

    const parts = [
      ["Clip body", "piece", pla.id, 12, 28, 1, clip.id, clipVersion.id],
      ["Hinge pin", "piece", pla.id, 2, 8, 2, clip.id, clipVersion.id],
      ["Soft pad", "piece", petg.id, 4, 15, 1, clip.id, clipVersion.id],
      ["Base plate", "plate", plaPlus.id, 85, 140, 1, stand.id, standVersion.id],
      ["Arm", "piece", plaPlus.id, 40, 70, 2, stand.id, standVersion.id],
      ["Ear pad", "piece", petg.id, 18, 35, 2, stand.id, standVersion.id],
    ] as const;

    for (const [name, kind, filament, weight, minutes, perProduct, product, version] of parts) {
      await track("parts", {
        workspace: workspaceId,
        product,
        version,
        name,
        kind,
        filament,
        grams: weight,
        minutes,
        perProduct,
      });
    }

    await track("printers", {
      workspace: workspaceId,
      name: "Bambu P1S",
      model: "0.4 mm nozzle",
      active: true,
    });

    const milestones = [
      { name: "20 cable clips", product: clip.id, version: clipVersion.id, targetQty: 20 },
      { name: "4 headphone stands", product: stand.id, version: standVersion.id, targetQty: 4 },
    ];

    let liveCards = (await pb.collection("print_cards").getFullList({ filter: `workspace = "${workspaceId}"` })).map(mapCard);

    for (const milestone of milestones) {
      const record = await track("milestones", {
        workspace: workspaceId,
        product: milestone.product,
        name: milestone.name,
        targetQty: milestone.targetQty,
        status: "active",
        notes: "",
        version: milestone.version,
      });
      const filaments = (await pb.collection("filaments").getFullList({ filter: `workspace = "${workspaceId}"` })).map(mapFilament);
      const allParts = (await pb.collection("parts").getFullList({ filter: `workspace = "${workspaceId}"` })).map(mapPart);
      const lines = allParts
        .filter((part) => part.product === milestone.product && part.version === milestone.version)
        .map((part) => lineForPart(part, jobsFor(part, milestone.targetQty)));
      const plan = planPrints(lines, stockForPlanning(filaments, liveCards));
      for (const card of plan.cards) {
        const saved = await track("print_cards", plannedCardFields(workspaceId, record.id, milestone.product, card));
        liveCards = [...liveCards, mapCard(saved)];
      }
    }
  } catch (error) {
    for (const item of [...created].reverse()) {
      await pb.collection(item.collection).delete(item.id).catch(() => undefined);
    }
    throw error;
  }
}
