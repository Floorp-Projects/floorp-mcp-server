import { FloorpClient } from "../src/client.js";

async function main() {
  const client = new FloorpClient();

  console.log("--- getTabs (/browser/tabs) ---");
  const browserTabs = await client.getTabs();
  console.log(JSON.stringify(browserTabs, null, 2));

  console.log("\n--- listTabInstances (/tabs/list) ---");
  try {
    const instances = await client.listTabInstances();
    console.log(JSON.stringify(instances, null, 2));
  } catch (e) {
    console.log("Error listing instances:", e);
  }
}

main().catch(console.error);
