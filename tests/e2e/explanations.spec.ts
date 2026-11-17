import { test, expect } from '@playwright/test';

test('inspect JavaScript lines and reveal arithmetic steps with keyboard access', async ({
  page,
}, testInfo) => {
  await page.goto('/#counter');
  await page.getByLabel('选择代码文件', { exact: true }).setInputFiles({
    name: 'explanation.mjs',
    mimeType: 'text/javascript',
    buffer: Buffer.from('const url = "https://example.com";\n// note\n\nlet value = 1; // mixed\n'),
  });
  await page.getByRole('button', { name: '开始统计', exact: true }).click();
  await expect(
    page.locator('.metric-card').filter({ hasText: '代码行数' }).locator('.metric-value'),
  ).toHaveText('2行');
  await page.getByRole('button', { name: '逐行解释', exact: true }).click();
  const lines = page.getByRole('region', { name: 'JavaScript 逐行解释', exact: true });
  await expect(lines).toContainText('总行数 4 = 代码 2 + 注释 1 + 空白 1');
  await lines.getByRole('button', { name: '查看第 1 行原因', exact: true }).click();
  await expect(lines.locator('.counter-line-reason')).toContainText('字符串');
  await lines.getByRole('button', { name: '查看第 4 行原因', exact: true }).click();
  await expect(lines.locator('.counter-line-reason')).toContainText('同时包含代码和注释');
  await expect(lines.locator('tbody tr')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await lines.screenshot({ path: testInfo.outputPath('counter-explanation.png') });

  await page
    .getByLabel('选择代码文件', { exact: true })
    .setInputFiles({ name: 'second.js', mimeType: 'text/javascript', buffer: Buffer.from('// fresh\n') });
  await expect(lines.locator('tbody')).toHaveCount(0);
  await page.getByRole('button', { name: '逐行解释', exact: true }).click();
  await expect(lines).toContainText('总行数 1 = 代码 0 + 注释 1 + 空白 0');

  await page.goto('/#math');
  await page.getByLabel('题目数量', { exact: true }).fill('1');
  const generated = page.waitForResponse((response) => response.url().endsWith('/api/math/generate'));
  await page.getByRole('button', { name: '生成练习', exact: true }).click();
  const worksheet = await (await generated).json();
  await page.getByRole('button', { name: '解析', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '这道题如何计算', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.math-step-answer')).toHaveCount(0);
  const close = dialog.getByRole('button', { name: '关闭解析', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '提示下一步', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.math-step-hint')).toBeVisible();
  await expect(dialog.locator('.math-step-answer')).toHaveCount(0);
  await dialog.getByRole('button', { name: '显示这一步', exact: true }).click();
  await expect(dialog.locator('.math-calculation-steps li')).toHaveCount(1);
  await dialog.getByRole('button', { name: '显示全部步骤', exact: true }).click();
  await expect(dialog.locator('.math-step-answer')).toHaveText(`最终结果：${worksheet.questions[0].answer}`);
  await dialog.getByRole('button', { name: '重新提示', exact: true }).click();
  await expect(dialog.locator('.math-calculation-steps li')).toHaveCount(0);
  await expect(dialog.locator('.math-step-answer')).toHaveCount(0);
  await dialog.getByRole('button', { name: '显示全部步骤', exact: true }).click();
  await dialog.screenshot({ path: testInfo.outputPath('math-explanation.png') });
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.height).toBeLessThanOrEqual(viewport.height);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '解析', exact: true })).toBeFocused();
});

test('line pagination and unparseable source remain usable', async ({ page }) => {
  await page.goto('/#counter');
  await page.getByLabel('选择代码文件', { exact: true }).setInputFiles({
    name: 'many.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from(Array(51).fill('// comment').join('\n')),
  });
  await page.getByRole('button', { name: '逐行解释', exact: true }).click();
  const lines = page.getByRole('region', { name: 'JavaScript 逐行解释', exact: true });
  await expect(lines.locator('tbody tr')).toHaveCount(50);
  await lines.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(lines.locator('tbody tr')).toHaveCount(1);
  await expect(lines.locator('.counter-line-reason')).toContainText('第 51 行');
  await page.getByLabel('选择代码文件', { exact: true }).setInputFiles({
    name: 'unfinished.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from('const x = "unfinished\n// still string'),
  });
  await page.getByRole('button', { name: '逐行解释', exact: true }).click();
  await expect(lines.locator('.counter-lines-warning')).toContainText('词法扫描');
  await expect(lines).toContainText('总行数 2 = 代码 2 + 注释 0 + 空白 0');
});
