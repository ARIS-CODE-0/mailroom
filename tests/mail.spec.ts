import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";
async function login(page: any) {
  await page.goto("/");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Ouvrir ma boîte mail" }).click();
  await expect(
    page.getByRole("button", { name: "Nouveau message" }),
  ).toBeVisible();
}
test("desktop: read, reply, attachment, save draft, restore, send and search", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  await expect(
    page.getByText("Les derniers détails pour vendredi", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/preview-desktop.png", fullPage: true });
  await page
    .getByText("Les derniers détails pour vendredi", { exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByText("programme.txt", { exact: true }).click();
  expect((await download).suggestedFilename()).toBe("programme.txt");
  await page.getByRole("button", { name: "À tous", exact: true }).click();
  await expect(page.getByLabel("À", { exact: true })).toHaveValue(
    "camille@example.org",
  );
  await expect(page.getByLabel("Cc", { exact: true })).toHaveValue(
    "lea@example.org",
  );
  await page.getByLabel("Objet", { exact: true }).fill("Réponse enregistrée");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Bonjour Camille, je confirme pour vendredi.");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Joindre des fichiers" }).click();
  await (
    await chooser
  ).setFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Pièce jointe de test"),
  });
  await expect(page.getByText("note.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fermer et enregistrer" }).click();
  await page.getByRole("button", { name: "Brouillons", exact: true }).click();
  await page.getByText("Réponse enregistrée", { exact: true }).click();
  await expect(page.getByText("note.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Message envoyé", { exact: true })).toBeVisible();
  await page.getByLabel("Rechercher un message").fill("Réponse enregistrée");
  await expect(
    page.getByText("Réponse enregistrée", { exact: true }),
  ).toBeVisible();
  await page.getByText("Réponse enregistrée", { exact: true }).click();
  await expect(
    page.getByText("Bonjour Camille, je confirme pour vendredi.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile: navigation, compose, preferences and logout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Ouvrir ma boîte mail" }).click();
  await expect(
    page.getByRole("button", { name: "Écrire", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Un café la semaine prochaine ?", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/preview-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Écrire", exact: true }).click();
  await page.getByLabel("Objet", { exact: true }).fill("Brouillon mobile");
  await page.getByLabel("À", { exact: true }).fill("inacheve@");
  await page.getByRole("button", { name: "Fermer et enregistrer" }).click();
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("button", { name: "Brouillons", exact: true }).click();
  await expect(
    page.getByText("Brouillon mobile", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Préférences", exact: true }).click();
  await page.getByLabel("Signature", { exact: true }).fill("Bien à toi, Aris");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByRole("button", { name: "Préférences", exact: true }).click();
  await expect(page.getByLabel("Signature", { exact: true })).toHaveValue(
    "Bien à toi, Aris",
  );
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await expect(
    page.getByText("Ton domaine. Ta boîte mail.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
