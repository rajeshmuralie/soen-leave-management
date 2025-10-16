// test-email.js
// Run this to test if SendGrid is configured correctly

require('dotenv').config();
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function testEmail() {
  console.log('🧪 Testing SendGrid email...\n');
  
  const msg = {
    to: 'rajesh@soenaudio.com', // Change this to your actual email
    from: process.env.SENDER_EMAIL,
    subject: 'Test Email from Soen Audio Leave Management',
    text: 'If you receive this email, SendGrid is configured correctly! ✅',
    html: '<strong>If you receive this email, SendGrid is configured correctly! ✅</strong>',
  };

  try {
    await sgMail.send(msg);
    console.log('✅ Test email sent successfully!');
    console.log(`📧 Check inbox at: ${msg.to}`);
    console.log('\n✨ SendGrid is working properly!');
  } catch (error) {
    console.error('❌ Error sending test email:');
    console.error(error);
    
    if (error.response) {
      console.error('\n📝 SendGrid error details:');
      console.error(error.response.body);
    }
  }
}

testEmail();