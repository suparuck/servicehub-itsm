// ต้องเขียน guard NEXT_RUNTIME ตรง ๆ ครอบ import — Next ใช้เงื่อนไขนี้ตัดโค้ด Node (nodemailer ฯลฯ) ออกจากบันเดิล edge
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBackgroundWorkers } = await import('./lib/mail/workers');
    startBackgroundWorkers();
  }
}
