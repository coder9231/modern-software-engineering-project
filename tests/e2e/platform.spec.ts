import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';

async function capture(page: Page, path: string) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path, fullPage: true });
}

async function expectMobileTouchTargets(page: Page) {
  if ((page.viewportSize()?.width ?? 1000) > 660) return;
  const undersized = await page.locator('.space-shell :is(button, a, summary)').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(element).visibility === 'hidden') return [];
      return rect.width < 47.5 || rect.height < 47.5
        ? [
            {
              label: element.getAttribute('aria-label') || element.textContent?.trim(),
              width: rect.width,
              height: rect.height,
            },
          ]
        : [];
    }),
  );
  expect(undersized).toEqual([]);
  const overflowingTabs = await page
    .locator('.math-tabs button')
    .evaluateAll((buttons) =>
      buttons
        .filter((button) => button.scrollWidth > button.clientWidth + 1)
        .map((button) => button.textContent?.trim()),
    );
  expect(overflowingTabs).toEqual([]);
}

test('upload code and use learning tools on desktop and mobile', async ({ page }, testInfo) => {
  const size = testInfo.project.name === 'chromium' ? 'desktop' : testInfo.project.name;
  await page.goto('/#counter');
  await expect(page.getByText('工作空间已就绪', { exact: true })).toBeAttached({ timeout: 30000 });
  const settings = page.locator('.platform-preferences summary');
  const bounds = await settings.boundingBox();
  const topbar = await page.locator('.topbar').boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(topbar!.y);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(topbar!.y + topbar!.height + 1);
  await settings.focus();
  await settings.press('Enter');
  await page.getByRole('button', { name: '高对比度：关', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(page.locator('.space-shell')).toHaveCSS('background-color', 'rgb(16, 12, 20)');
  const motionButton = page.getByRole('button', { name: /^静态画面/ });
  if ((await motionButton.getAttribute('aria-pressed')) === 'true') await motionButton.click();
  await motionButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
  await mkdir('reports', { recursive: true });
  await capture(page, `reports/upgrade-preferences-${size}.png`);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
  await page.getByRole('button', { name: '返回空间', exact: true }).first().click();
  await expect(page.locator('.spatial-scene__ring-turn')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.spatial-scene__signal').first()).toHaveCSS('display', 'none');
  await settings.click();
  await page.getByRole('button', { name: '高对比度：开', exact: true }).click();
  await page.getByRole('button', { name: '静态画面：开', exact: true }).click();
  await settings.click();
  await page
    .getByRole('navigation', { name: '工作空间入口', exact: true })
    .getByRole('button', { name: '进入代码统计', exact: true })
    .click();
  await expect(page.getByText('工作空间已就绪', { exact: true })).toBeAttached();
  await expect(page.getByLabel('选择代码文件', { exact: true })).toBeAttached();
  await expect(page.locator('.space-shell')).toHaveClass(/in-workspace/);
  await expect(page.getByRole('heading', { name: '代码统计', exact: true })).toBeVisible();
  await expectMobileTouchTargets(page);
  await page.getByLabel('选择代码文件', { exact: true }).setInputFiles({
    name: 'lesson.go',
    mimeType: 'text/plain',
    buffer: Buffer.from('// lesson\npackage main\n\nfunc main() {}\n'),
  });
  await page.getByRole('button', { name: '开始统计', exact: true }).click();
  await expect(
    page.locator('.metric-card').filter({ hasText: '代码行数' }).locator('.metric-value'),
  ).toHaveText('2行');
  await expect(
    page.locator('.metric-card').filter({ hasText: '注释行数' }).locator('.metric-value'),
  ).toHaveText('1行');
  await expect(
    page.locator('.metric-card').filter({ hasText: '空白行数' }).locator('.metric-value'),
  ).toHaveText('1行');
  await page.getByRole('button', { name: '分析所选源码质量', exact: true }).click();
  await expect(page.locator('.counter-insights [role="status"]')).toContainText('重复行率 0.0% · 1 个文件');
  await expect(page.locator('.counter-insights tbody')).toContainText('lesson.go');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('reports', { recursive: true });
  await capture(page, `reports/upgrade-counter-${size}.png`);
  if (await page.getByRole('button', { name: '打开导航', exact: true }).isVisible())
    await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await page.getByRole('button', { name: '四则运算 MATH LAB', exact: true }).click();
  await page.getByLabel('题目数量', { exact: true }).fill('3');
  const generation = page.waitForResponse((response) => response.url().endsWith('/api/math/generate'));
  await page.getByRole('button', { name: '生成练习', exact: true }).click();
  const worksheet = await (await generation).json();
  await page
    .getByLabel('第 1 题答案', { exact: true })
    .fill(worksheet.questions[0].answer === '0' ? '1' : '0');
  await page.getByRole('button', { name: '提交整卷批改', exact: true }).click();
  await expect(page.locator('.math-grade-summary')).toBeVisible();
  await expectMobileTouchTargets(page);
  await capture(page, `reports/upgrade-math-${size}.png`);
  await page.getByRole('button', { name: /^错题本/ }).click();
  await expect(page.locator('.math-mistakes')).toBeVisible();
  await expect(page.locator('.math-mistakes .math-review-list article')).toHaveCount(3);
  await page.reload();
  await page.getByRole('button', { name: /^错题本/ }).click();
  await expect(page.locator('.math-mistakes .math-review-list article')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('compare revisions and export a classroom batch', async ({ page }, testInfo) => {
  await page.goto('/#counter');
  const upload = page.getByLabel('选择代码文件', { exact: true });
  await upload.setInputFiles({
    name: 'lesson.go',
    mimeType: 'text/plain',
    buffer: Buffer.from('// lesson\npackage main\n\nfunc main() {}\n'),
  });
  await page.getByRole('button', { name: '开始统计', exact: true }).click();
  const codeLines = page.locator('.metric-card').filter({ hasText: '代码行数' }).locator('.metric-value');
  await expect(codeLines).toHaveText('2行');
  await page.getByRole('button', { name: '当前结果设为基准', exact: true }).click();
  await upload.setInputFiles({
    name: 'lesson.go',
    mimeType: 'text/plain',
    buffer: Buffer.from('// lesson\npackage main\n\nfunc main() {\n  println("hello")\n}\n'),
  });
  await page.getByRole('button', { name: '开始统计', exact: true }).click();
  await expect(codeLines).toHaveText('4行');
  await page.getByRole('button', { name: '当前结果设为新版本', exact: true }).click();
  await page.getByRole('button', { name: '生成差异报告', exact: true }).click();
  await expect(page.locator('.counter-insights [role="status"]').last()).toHaveText(
    '代码行变化 +2 · 新增 0 · 删除 0 · 规模变化 1 · 行数相同 0',
  );
  const comparisonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出差异 JSON', exact: true }).click();
  const comparison = await comparisonDownload;
  expect(comparison.suggestedFilename()).toBe('comparison.json');
  const comparisonPath = testInfo.outputPath('comparison.json');
  await comparison.saveAs(comparisonPath);
  const { readFile } = await import('node:fs/promises');
  const difference = JSON.parse(await readFile(comparisonPath, 'utf8'));
  expect(difference.delta).toMatchObject({ code: 2, comment: 0, blank: 0 });
  expect(difference.files.changed).toHaveLength(1);

  await page.getByLabel('选择学生作业 ZIP', { exact: true }).setInputFiles([
    {
      name: 'student-one.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipSync({ 'lesson.go': strToU8('// lesson\npackage main\n\nfunc main() {}\n') })),
    },
    {
      name: 'student-two.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipSync({ 'exercise.py': strToU8('# lesson\nprint(1)\nprint(2)\nprint(3)\n') })),
    },
  ]);
  const rows = page.getByRole('region', { name: '班级批量统计', exact: true }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveText('student-one120完成');
  await expect(rows.nth(1)).toHaveText('student-two130完成');
  const batchDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出全班汇总 CSV', exact: true }).click();
  const batch = await batchDownload;
  expect(batch.suggestedFilename()).toBe('classroom-summary.csv');
  const batchPath = testInfo.outputPath('classroom-summary.csv');
  await batch.saveAs(batchPath);
  const csv = await readFile(batchPath, 'utf8');
  expect(
    csv
      .split('\r\n')
      .slice(1)
      .map((line) => line.split(',')),
  ).toEqual([
    ['student-one', '1', '4', '2', '1', '1', '0', ''],
    ['student-two', '1', '4', '3', '1', '0', '0', ''],
  ]);
  const size = testInfo.project.name === 'chromium' ? 'desktop' : testInfo.project.name;
  await capture(page, `reports/upgrade-batch-comparison-${size}.png`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('system reduced motion disables the space animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#overview');
  await expect(page.locator('.spatial-scene__ring-turn')).toHaveCSS('animation-name', 'none');
  await expectMobileTouchTargets(page);
  const animations = await page
    .locator('.spatial-scene')
    .evaluate(
      (element) =>
        element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running')
          .length,
    );
  expect(animations).toBe(0);
});

test('streaming worksheet completes and all pages can be graded', async ({ page }) => {
  await page.goto('/#math');
  await page.getByLabel('题目数量', { exact: true }).fill('300');
  const stream = page.waitForResponse((response) => response.url().endsWith('/api/math/generate/stream'));
  await page.getByRole('button', { name: '生成练习', exact: true }).click();
  expect((await stream).headers()['content-type']).toContain('application/x-ndjson');
  await expect(page.getByText(/已生成 300 道题/)).toBeVisible({ timeout: 35000 });
  await expect(page.locator('.math-question')).toHaveCount(12);
  await expect(page.locator('.math-pagination')).toContainText('第 1 / 25 页');
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByLabel('第 13 题答案', { exact: true })).toBeVisible();
  const grade = page.waitForResponse(
    (response) => response.url().endsWith('/api/math/grade') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '提交整卷批改', exact: true }).click();
  expect(await (await grade).json()).toMatchObject({ total: 300, answered: 0, correct: 0 });
  await expect(page.locator('.math-grade-summary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('local printed OCR requires review and grades the recognized image', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.goto('/#math');
  await page.getByRole('button', { name: '拍照改卷', exact: true }).click();
  await expect(page.getByText('本机印刷体识别已就绪，无需密钥。', { exact: true })).toBeVisible();
  const dataURL = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 300;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    context.font = '64px "Courier New", monospace';
    context.fillText('12 + 8 = 20', 60, 100);
    context.fillText('9 - 3 = 6', 60, 220);
    return canvas.toDataURL('image/png');
  });
  const requests: string[] = [];
  const imageUploads: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
    if (request.method() === 'POST' && request.url().endsWith('/api/math/ocr'))
      imageUploads.push(request.url());
  });
  await page.getByLabel('选择练习图片', { exact: true }).setInputFiles({
    name: 'printed-arithmetic.png',
    mimeType: 'image/png',
    buffer: Buffer.from(dataURL.split(',')[1], 'base64'),
  });
  await page.getByRole('button', { name: '在本机识别', exact: true }).click();
  const entries = page.getByLabel('每行输入“算式 = 答案”', { exact: true });
  await expect(page.getByText(/已提取 2 行/)).toBeVisible({ timeout: 90000 });
  const recognized = await entries.inputValue();
  await testInfo.attach('recognized-text', { body: recognized, contentType: 'text/plain' });
  const lines = recognized.split('\n').map((line) => line.replace(/\s/g, ''));
  expect(lines).toHaveLength(2);
  expect(lines[0]).toBe('12+8=20');
  expect(lines[1]).toMatch(/^9-3=\d+$/);
  await mkdir('reports', { recursive: true });
  const size = testInfo.project.name === 'chromium' ? 'desktop' : testInfo.project.name;
  await writeFile(`reports/upgrade-ocr-recognized-${size}.txt`, recognized);
  await writeFile('reports/upgrade-ocr-input.png', Buffer.from(dataURL.split(',')[1], 'base64'));
  await capture(page, `reports/upgrade-ocr-raw-${size}.png`);
  const gradeButton = page.getByRole('button', { name: '批改录入内容', exact: true });
  await expect(gradeButton).toBeDisabled();
  const confirmed = page.getByLabel('我已逐行核对识别内容', { exact: true });
  await confirmed.check();
  await expect(gradeButton).toBeEnabled();
  // OCR can misread print. The required review step must permit corrections and reset confirmation.
  await entries.fill('12 + 8 = 20\n9 - 3 = 6');
  await expect(confirmed).not.toBeChecked();
  await expect(gradeButton).toBeDisabled();
  await confirmed.check();
  await gradeButton.click();
  await expect(page.getByRole('region', { name: '手动批改结果', exact: true })).toContainText('2 / 2 题正确');
  expect(imageUploads).toEqual([]);
  expect(requests.filter((url) => new URL(url).origin !== new URL(page.url()).origin)).toEqual([]);
  await mkdir('reports', { recursive: true });
  await capture(page, `reports/upgrade-ocr-${size}.png`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
