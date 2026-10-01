import { test, expect } from '@playwright/test';
const latest = (states) => states.at(-1);
function capture(page) {
  const states = [];
  page.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      try {
        const message = JSON.parse(payload);
        if (message.state) states.push(message.state);
      } catch {
        /* Ignore non-game frames. */
      }
    }),
  );
  return states;
}
for (const prefix of ['', '/wallball']) {
  test(`two remote browsers play, reject a third seat and reconnect${prefix || ' at root'}`, async ({
    browser,
  }) => {
    test.setTimeout(45_000);
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
    const [host, guest, extra] = await Promise.all(contexts.map((c) => c.newPage()));
    const hostStates = capture(host),
      guestStates = capture(guest),
      errors = [];
    for (const page of [host, guest]) page.on('pageerror', (error) => errors.push(error.message));
    try {
      await host.goto(`http://127.0.0.1:5173${prefix}/`);
      await host.getByRole('button', { name: 'Online', exact: false }).click();
      await host.getByRole('button', { name: 'CREATE A PRIVATE ROOM' }).click();
      await expect(host.getByRole('heading', { name: 'Bring a friend.' })).toBeVisible();
      const invite = await host.locator('#invite-link').inputValue();
      expect(new URL(invite).pathname).toBe(prefix + '/');
      await guest.goto(invite);
      await expect(guest.getByRole('heading', { name: 'Ready to rally?' })).toBeVisible();
      await expect(host.locator('#your-seat')).toHaveText('YOU PLAY LEFT');
      await expect(guest.locator('#your-seat')).toHaveText('YOU PLAY RIGHT');
      await host.getByRole('button', { name: 'READY TO PLAY' }).click();
      await expect(host.locator('#start')).toBeDisabled();
      await guest.getByRole('button', { name: 'READY TO PLAY' }).click();
      await expect(host.locator('#match-label')).toHaveText('ONLINE MATCH');
      await expect(guest.locator('#match-label')).toHaveText('ONLINE MATCH');
      await host.locator('#game').focus();
      await host.keyboard.down('KeyW');
      await expect.poll(() => latest(guestStates)?.match.players[0].y).toBeLessThan(230);
      await host.keyboard.up('KeyW');
      await expect
        .poll(() => guestStates.some((s) => s.phase === 'playing' && s.match.balls.length > 0))
        .toBe(true);
      const common = guestStates.findLast(
        (g) =>
          g.phase === 'playing' &&
          g.match.time > 1 &&
          hostStates.some((h) => h.match.time === g.match.time),
      );
      expect(common).toBeTruthy();
      expect(hostStates.find((h) => h.match.time === common.match.time).match).toEqual(
        common.match,
      );
      await extra.goto(invite);
      await expect(extra.locator('#connection-error')).toContainText('two players');
      await host.getByRole('button', { name: 'Pause', exact: false }).click();
      await expect(guest.locator('#overlay-title')).toHaveText('Rally on hold.');
      await expect.poll(() => latest(hostStates)?.phase).toBe('paused');
      const time = latest(hostStates).match.time;
      await guest.reload();
      await expect(guest.locator('#your-seat')).toHaveText('YOU PLAY RIGHT');
      await expect(guest.getByRole('button', { name: 'RESUME GAME' })).toBeVisible();
      await expect(host.getByRole('button', { name: 'RESUME GAME' })).toBeVisible();
      expect(latest(guestStates).match.time).toBe(time);
      await host.getByRole('button', { name: 'RESUME GAME' }).click();
      await guest.getByRole('button', { name: 'RESUME GAME' }).click();
      await expect(host.locator('#overlay')).toBeHidden();
      await expect(guest.locator('#overlay')).toBeHidden();
      await expect.poll(() => latest(guestStates)?.match.time).toBeGreaterThan(time);
      await guest.reload();
      await expect(guest.getByRole('button', { name: 'RESUME GAME' })).toBeVisible();
      await expect(host.getByRole('button', { name: 'RESUME GAME' })).toBeVisible();
      await host.getByRole('button', { name: 'RESUME GAME' }).click();
      await guest.getByRole('button', { name: 'RESUME GAME' }).click();
      await expect(guest.locator('#overlay')).toBeHidden();
      await host.getByRole('button', { name: 'Leave', exact: true }).click();
      await expect(host.locator('#room-bar')).toBeHidden();
      await expect(guest.locator('#overlay-description')).toContainText(
        /left the room|Room closed/,
      );
      expect(errors).toEqual([]);
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
}
test('subpath redirects and same-origin API boundaries', async ({ request }) => {
  const redirect = await request.get('/wallball', { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toMatch(/\/wallball\/$/);
  const blocked = await request.post('/api/rooms', { headers: { Origin: 'https://example.com' } });
  expect(blocked.status()).toBe(403);
  const invalid = await request.post('/wallball/api/rooms/INVALID/join', {
    headers: { Origin: 'http://127.0.0.1:5173' },
  });
  expect(invalid.status()).toBe(404);
  for (const asset of ['app.js', 'network.js', 'assets/MultiBall.png'])
    expect((await request.get('/wallball/' + asset)).status()).toBe(200);
});
test('mobile guest touch controls move the guest seat, not the host', async ({ browser }) => {
  const desktop = await browser.newContext(),
    mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
  const host = await desktop.newPage(),
    guest = await mobile.newPage();
  const states = capture(host);
  try {
    await host.goto('http://127.0.0.1:5173/');
    await host.getByRole('button', { name: 'Online', exact: false }).click();
    await host.getByRole('button', { name: 'CREATE A PRIVATE ROOM' }).click();
    await expect(host.locator('#active-room-code')).not.toBeEmpty();
    await guest.goto(await host.locator('#invite-link').inputValue());
    await expect(guest.getByRole('button', { name: 'READY TO PLAY' })).toBeVisible();
    await host.getByRole('button', { name: 'READY TO PLAY' }).click();
    await guest.getByRole('button', { name: 'READY TO PLAY' }).tap();
    await expect(guest.locator('#overlay')).toBeHidden();
    const control = guest.getByRole('button', { name: 'Your paddle up', exact: true });
    await control.scrollIntoViewIfNeeded();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await control.boundingBox(),
      cdp = await mobile.newCDPSession(guest);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await expect.poll(() => latest(states)?.match.players[1].y).toBeLessThan(230);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(latest(states).match.players[0].y).toBe(250);
    await host.getByRole('button', { name: 'Leave', exact: true }).click();
  } finally {
    await desktop.close();
    await mobile.close();
  }
});
