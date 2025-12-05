import { FloorpClient } from "../src/client.js";

async function main() {
  console.log("Initializing FloorpClient...");
  const client = new FloorpClient();

  console.log("Checking health...");
  const health = await client.checkHealth();
  console.log("Health:", health);

  if (!health) {
    console.error(
      "Floorp server is not reachable. Make sure Floorp is running and floorp.mcp.enabled is true."
    );
    return;
  }

  console.log("Listing tabs...");
  try {
    const tabs = await client.getTabs();
    console.log(`Found ${tabs.length} tabs.`);
    if (tabs.length > 0) {
      console.log("First tab title:", tabs[0].title);
    }
  } catch (e) {
    console.error("Failed to list tabs:", e);
  }

  console.log("Creating a new tab for automation test...");
  try {
    const tabId = await client.createTab("https://example.com");
    console.log("Created tab with ID:", tabId);

    // Wait a bit for load
    await new Promise((r) => setTimeout(r, 3000));

    console.log("Taking screenshot...");
    const screenshot = await client.takeScreenshot(tabId);
    if (screenshot) {
      console.log("Screenshot taken successfully. Length:", screenshot.length);
      console.log("Content start:", screenshot.substring(0, 100));
      if (screenshot.startsWith("data:")) {
        console.error("FAIL: Screenshot still has data URI prefix!");
      } else {
        console.log("PASS: Screenshot data seems clean.");
      }
    } else {
      console.error("Screenshot returned null");
    }
  } catch (e) {
    console.error("Automation test failed:", e);
  }

  console.log("Test finished.");
}

main().catch(console.error);
