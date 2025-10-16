require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const sgMail = require('@sendgrid/mail');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection - FIXED for Render deployment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// SendGrid setup
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to the database:', err.stack);
  } else {
    console.log('✅ Database connected successfully:', new Date().toISOString());
    release();
  }
});

// ============================================
// EMAIL HELPER FUNCTION
// ============================================
async function sendSoenEmail(to, subject, body) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDER_EMAIL) {
    console.log('⚠️ Email not configured, skipping email send');
    return;
  }

  const emailHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🎵 SOEN AUDIO</div>
          <div style="font-size: 14px;">Leave Management System</div>
        </div>
        <div class="content">
          <pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${body}</pre>
        </div>
        <div class="footer">
          <p>Soen Audio Leave Management System</p>
          <p>This is an automated email. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sgMail.send({
    to: to,
    from: process.env.SENDER_EMAIL,
    subject: subject,
    text: body,
    html: emailHTML
  });
}

// ============================================
// ALL LEAVE TYPES
// ============================================
const LEAVE_TYPES = [
  'Casual Leave',
  'Sick Leave',
  'Earned Leave',
  'Privilege Leave',
  'Maternity Leave',
  'Paternity Leave',
  'Compensatory Off',
  'Leave Without Pay'
];

// ============================================
// API ENDPOINTS
// ============================================

// Get all leave types
app.get('/api/leave-types', (req, res) => {
  res.json({ success: true, data: LEAVE_TYPES });
});

// Get all employees
app.get('/api/employees', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.*,
        m.name as manager_name,
        m.email as manager_email
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      ORDER BY e.id
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Error fetching employees:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add new employee
app.post('/api/employees', async (req, res) => {
  try {
    const { 
      emp_number, username, name, email, role, manager_id, 
      working_days, holidays,
      casual_leave, sick_leave, earned_leave, privilege_leave,
      maternity_leave, paternity_leave, compensatory_off, leave_without_pay
    } = req.body;

    const total_leaves = (casual_leave || 0) + (sick_leave || 0) + (earned_leave || 0) + 
                        (privilege_leave || 0) + (maternity_leave || 0) + (paternity_leave || 0) + 
                        (compensatory_off || 0) + (leave_without_pay || 0);

    const result = await pool.query(`
      INSERT INTO employees (
        emp_number, username, name, email, role, manager_id, 
        working_days, holidays, leaves_entitled, leaves_taken,
        casual_leave, sick_leave, earned_leave, privilege_leave,
        maternity_leave, paternity_leave, compensatory_off, leave_without_pay
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      emp_number, username, name, email, role, manager_id, 
      working_days, holidays, total_leaves,
      casual_leave || 0, sick_leave || 0, earned_leave || 0, privilege_leave || 0,
      maternity_leave || 0, paternity_leave || 0, compensatory_off || 0, leave_without_pay || 0
    ]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error adding employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update employee
app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      emp_number, name, email, role, manager_id, 
      working_days, holidays,
      casual_leave, sick_leave, earned_leave, privilege_leave,
      maternity_leave, paternity_leave, compensatory_off, leave_without_pay,
      leaves_taken
    } = req.body;

    const total_leaves = (casual_leave || 0) + (sick_leave || 0) + (earned_leave || 0) + 
                        (privilege_leave || 0) + (maternity_leave || 0) + (paternity_leave || 0) + 
                        (compensatory_off || 0) + (leave_without_pay || 0);

    const result = await pool.query(`
      UPDATE employees SET
        emp_number = $1,
        name = $2,
        email = $3,
        role = $4,
        manager_id = $5,
        working_days = $6,
        holidays = $7,
        leaves_entitled = $8,
        leaves_taken = $9,
        casual_leave = $10,
        sick_leave = $11,
        earned_leave = $12,
        privilege_leave = $13,
        maternity_leave = $14,
        paternity_leave = $15,
        compensatory_off = $16,
        leave_without_pay = $17
      WHERE id = $18
      RETURNING *
    `, [
      emp_number, name, email, role, manager_id, 
      working_days, holidays, total_leaves, leaves_taken || 0,
      casual_leave || 0, sick_leave || 0, earned_leave || 0, privilege_leave || 0,
      maternity_leave || 0, paternity_leave || 0, compensatory_off || 0, leave_without_pay || 0,
      id
    ]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error updating employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete employee
app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM employees WHERE id = $1', [id]);
    res.json({ success: true, message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get leave applications
app.get('/api/leave-applications', async (req, res) => {
  try {
    const { employee_id, manager_id } = req.query;
    
    let query = `
      SELECT 
        la.*,
        e.name as employee_name,
        e.emp_number,
        e.email as employee_email,
        m.name as manager_name,
        m.email as manager_email
      FROM leave_applications la
      JOIN employees e ON la.employee_id = e.id
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE 1=1
    `;
    const params = [];
    
    if (employee_id) {
      params.push(employee_id);
      query += ` AND la.employee_id = $${params.length}`;
    }
    
    if (manager_id) {
      params.push(manager_id);
      query += ` AND e.manager_id = $${params.length}`;
    }
    
    query += ' ORDER BY la.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Error fetching leave applications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Apply for leave
app.post('/api/leave-applications', async (req, res) => {
  try {
    const { employee_id, leave_type, start_date, end_date, days_requested, reason } = req.body;

    const result = await pool.query(`
      INSERT INTO leave_applications (
        employee_id, leave_type, start_date, end_date, days_requested, reason, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *
    `, [employee_id, leave_type, start_date, end_date, days_requested, reason]);

    // Get employee and manager details for email
    const employeeResult = await pool.query(`
      SELECT 
        e.name as employee_name,
        e.email as employee_email,
        e.emp_number,
        m.name as manager_name,
        m.email as manager_email
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.id = $1
    `, [employee_id]);

    const employee = employeeResult.rows[0];

    // Send email to manager
    if (employee.manager_email) {
      const emailBody = `Hi ${employee.manager_name},

${employee.employee_name} (${employee.emp_number}) has applied for leave.

Leave Details:
- Leave Type: ${leave_type}
- Start Date: ${start_date}
- End Date: ${end_date}
- Days Requested: ${days_requested}
- Reason: ${reason}

Please login to the system to approve or reject this request.

Best regards,
Soen Audio HR Team`;

      try {
        await sendSoenEmail(
          employee.manager_email,
          `New Leave Request from ${employee.employee_name}`,
          emailBody
        );
        console.log(`✅ Email sent to manager: ${employee.manager_email}`);
      } catch (emailError) {
        console.error('❌ Failed to send email:', emailError);
      }
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error creating leave application:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve leave
app.post('/api/leave-applications/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approved_by } = req.body;

    const result = await pool.query(`
      UPDATE leave_applications
      SET status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [approved_by, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Leave application not found' 
      });
    }

    const application = result.rows[0];

    // Update employee's leaves_taken
    await pool.query(`
      UPDATE employees
      SET leaves_taken = leaves_taken + $1
      WHERE id = $2
    `, [application.days_requested, application.employee_id]);

    // Get employee and approver details
    const detailsResult = await pool.query(`
      SELECT 
        e.name as employee_name,
        e.email as employee_email,
        a.name as approver_name
      FROM employees e
      JOIN employees a ON a.id = $1
      WHERE e.id = $2
    `, [approved_by, application.employee_id]);

    const { employee_name, employee_email, approver_name } = detailsResult.rows[0];

    // Send approval email
    const emailBody = `Hi ${employee_name},

Good news! Your leave request has been APPROVED by ${approver_name}.

Leave Details:
- Leave Type: ${application.leave_type}
- Start Date: ${application.start_date}
- End Date: ${application.end_date}
- Days: ${application.days_requested}

Have a great time off!

Best regards,
Soen Audio HR Team`;

    try {
      await sendSoenEmail(
        employee_email,
        'Leave Request Approved ✅',
        emailBody
      );
      console.log(`✅ Approval email sent to: ${employee_email}`);
    } catch (emailError) {
      console.error('❌ Failed to send approval email:', emailError);
    }

    res.json({ 
      success: true, 
      data: application,
      message: 'Leave application approved'
    });

  } catch (error) {
    console.error('❌ Error approving leave application:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reject leave
app.post('/api/leave-applications/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { approved_by, rejection_reason } = req.body;

    const result = await pool.query(`
      UPDATE leave_applications
      SET status = 'rejected', approved_by = $1, rejection_reason = $2, approved_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [approved_by, rejection_reason, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Leave application not found' 
      });
    }

    const application = result.rows[0];

    // Get employee and approver details
    const detailsResult = await pool.query(`
      SELECT 
        e.name as employee_name,
        e.email as employee_email,
        a.name as approver_name
      FROM employees e
      JOIN employees a ON a.id = $1
      WHERE e.id = $2
    `, [approved_by, application.employee_id]);

    const { employee_name, employee_email, approver_name } = detailsResult.rows[0];

    // Send rejection email
    const emailBody = `Hi ${employee_name},

Unfortunately, your leave request has been REJECTED by ${approver_name}.

Leave Details:
- Leave Type: ${application.leave_type}
- Start Date: ${application.start_date}
- End Date: ${application.end_date}
- Days: ${application.days_requested}

Reason for Rejection:
${rejection_reason || 'No specific reason provided'}

Please contact your manager if you have any questions.

Best regards,
Soen Audio HR Team`;

    try {
      await sendSoenEmail(
        employee_email,
        'Leave Request Rejected ❌',
        emailBody
      );
      console.log(`✅ Rejection email sent to: ${employee_email}`);
    } catch (emailError) {
      console.error('❌ Failed to send rejection email:', emailError);
    }

    res.json({ 
      success: true, 
      data: application,
      message: 'Leave application rejected'
    });

  } catch (error) {
    console.error('❌ Error rejecting leave application:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 Soen Audio Leave Management API Server                ║
║                                                            ║
║   📍 Server running on: http://localhost:${PORT}            ║
║   📧 SendGrid configured: ${process.env.SENDGRID_API_KEY ? '✅' : '❌'}                         ║
║   💾 Database connected: Check logs above                 ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});