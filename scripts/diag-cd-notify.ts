import { getCdNotificationRecipients } from "../lib/cd-notifications";
async function main() {
  const rows = await getCdNotificationRecipients();
  console.log(rows);
}
main();
