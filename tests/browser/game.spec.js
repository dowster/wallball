import { test, expect } from '@playwright/test';
test('solo keyboard, pause, resume and menu', async ({page}) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await page.getByRole('button',{name:'LET’S PLAY'}).click();
  await expect(page.locator('#overlay')).toBeHidden(); await expect(page.locator('#match-label')).toHaveText('SOLO MATCH');
  const paddleY=()=>page.locator('#game').evaluate(canvas=>{
    const ctx=canvas.getContext('2d'), data=ctx.getImageData(25,0,1,500).data;
    const rows=[]; for(let y=0;y<500;y++) if(data[y*4]===155 && data[y*4+1]===245 && data[y*4+2]===209) rows.push(y);
    return rows.reduce((sum,y)=>sum+y,0)/rows.length;
  });
  const before=await paddleY();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(200); await page.keyboard.up('KeyW');
  expect(await paddleY()).toBeLessThan(before-20);
  await page.keyboard.press('Space'); await expect(page.getByRole('heading',{name:'Rally on hold.'})).toBeVisible();
  await page.getByRole('button',{name:'RESUME GAME'}).click(); await expect(page.locator('#overlay')).toBeHidden();
  await page.keyboard.press('Escape'); await expect(page.getByRole('heading',{name:'Meet your match.'})).toBeVisible();
  expect(errors).toEqual([]);
});
test('two-player mode and automatic pause', async ({page}) => {
  await page.goto('/'); await page.getByRole('button',{name:'Two players'}).click(); await expect(page.locator('#difficulty')).toBeDisabled();
  await page.getByRole('button',{name:'LET’S PLAY'}).click(); await expect(page.locator('#right-name')).toHaveText('PLAYER 02');
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(150); await page.keyboard.up('ArrowDown');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur'))); await expect(page.locator('#match-label')).toHaveText('PAUSED');
});
test('mobile layout, touch control and assets', async ({browser}) => {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const page=await context.newPage();
  const failures=[]; page.on('response',r=>{if(r.status()>=400) failures.push(r.url());});
  await page.goto('/'); await page.getByRole('button',{name:'LET’S PLAY'}).tap();
  await expect(page.getByRole('button',{name:'Player one up',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Player one up',exact:true}).tap();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Pause',exact:false}).tap(); await expect(page.locator('#overlay-title')).toHaveText('Rally on hold.');
  expect(failures).toEqual([]); await context.close();
});
