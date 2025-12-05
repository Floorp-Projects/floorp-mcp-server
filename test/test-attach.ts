import { FloorpClient } from "../src/client.js";

async function main() {
  const client = new FloorpClient();

  try {
    console.log("Listing tabs...");
    const tabs = await client.getTabs();
    console.log(`Found ${tabs.length} tabs.`);

    if (tabs.length === 0) {
      console.log("No tabs found to attach to.");
      return;
    }

    const targetTab = tabs[0];
    console.log(
      `Attempting to attach to tab ID: ${targetTab.id} (${targetTab.title})`
    );

    const instanceId = await client.attachToTab(targetTab.id);
    console.log("Successfully attached. Instance ID:", instanceId);

    console.log("Taking screenshot of attached tab...");
    const screenshot = await client.takeScreenshot(instanceId);
    if (screenshot) {
      console.log("Screenshot taken. Length:", screenshot.length);
      console.log(
        "Prefix check:",
        screenshot.startsWith("data:") ? "FAIL" : "PASS"
      );
    } else {
      console.error("Screenshot failed.");
    }
  } catch (e) {
    console.error("Test failed:", e);
  }
}

main().catch(console.error);
