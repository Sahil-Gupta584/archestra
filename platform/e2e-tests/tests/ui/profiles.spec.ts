import { E2eTestId } from "@shared";
import { expect, test } from "./fixtures";

test("can create and delete a profile", async ({
  page,
  makeRandomString,
  goToPage,
}) => {
  // Skip onboarding if dialog is present
  const skipButton = page.getByTestId(E2eTestId.OnboardingSkipButton);
  if (await skipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipButton.click();
    // Wait for dialog to close
    await page.waitForTimeout(500);
  }

  const PROFILE_NAME = makeRandomString(10, "Test Profile");
  await goToPage(page, "/profiles");
  await page.getByTestId(E2eTestId.CreateProfileButton).click();
  await page.getByRole("textbox", { name: "Name" }).fill(PROFILE_NAME);
  await page.locator("[type=submit]").click();
  await page.waitForTimeout(1000);

  // Close the "How to connect" modal which shows up after creating a profile
  await page.getByTestId(E2eTestId.CreateProfileCloseHowToConnectButton).click();

  // Check if the profile is created
  await expect(
    page.getByTestId(E2eTestId.ProfilesTable).getByText(PROFILE_NAME),
  ).toBeVisible();

  // Delete created profile - click the delete button directly
  await page
    .getByTestId(`${E2eTestId.DeleteProfileButton}-${PROFILE_NAME}`)
    .click();
  await page.getByRole("button", { name: "Delete profile" }).click();

  await expect(
    page.getByTestId(E2eTestId.ProfilesTable).getByText(PROFILE_NAME),
  ).not.toBeVisible();
});
