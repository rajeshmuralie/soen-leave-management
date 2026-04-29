const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== SENDGRID CONFIGURATION ====================
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('✅ SendGrid configured');
} else {
  console.warn('⚠️  SendGrid API key not found - emails will not be sent');
}

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@soenaudio.com';

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://soen_leave_db_user:S43ynFx6JmjLEL4o4uZM3NNkMhWxSk6v@dpg-ct7lpfrqf0us73b5s480-a.oregon-postgres.render.com/soen_leave_db',
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully at:', res.rows[0].now);
  }
});

// CORRECT EMPLOYEE DATA - 14 employees total
const EMPLOYEE_STRUCTURE = {
  // 3 OWNERS
  owners: [
    { id: 1, name: 'Hari Seedhar', email: 'h@soenaudio.com', role: 'owner', managerId: null },
    { id: 2, name: 'Daniel Kissel', email: 'daniel@soenaudio.com', role: 'owner', managerId: null },
    { id: 3, name: 'Glen Walters', email: 'glen@soenaudio.com', role: 'owner', managerId: null }
  ],
  // MANAGERS (Rajesh reports to Hari, but is also a manager for his team)
  managers: [
    { id: 4, name: 'Rajesh Murali', email: 'rajesh@soenaudio.com', role: 'admin', managerId: 1 }
  ],
  // 10 EMPLOYEES
  employees: [
    // Reporting to Rajesh (4 employees)
    { id: 5, name: 'Sanket Mahadik', email: 'sanket@soenaudio.com', role: 'employee', managerId: 4 },
    { id: 6, name: 'Chindan Thiyagarajan', email: 'chindan@soenaudio.com', role: 'employee', managerId: 4 },
    { id: 7, name: 'Upendra Kagana', email: 'upendra@soenaudio.com', role: 'employee', managerId: 4 },
    { id: 8, name: 'John Verma', email: 'john@soenaudio.com', role: 'employee', managerId: 4 },
    // Reporting to Hari (4 employees)
    { id: 9, name: 'Rick', email: 'rick@soenaudio.com', role: 'employee', managerId: 1 },
    { id: 10, name: 'Bruce Ryan', email: 'bruce@soenaudio.com', role: 'employee', managerId: 1 },
    { id: 11, name: 'Nikki', email: 'nikki@soenaudio.com', role: 'employee', managerId: 1 },
    { id: 55, name: 'TBD Employee', email: 'tbd@soenaudio.com', role: 'employee', managerId: 1 },
    // Reporting to Daniel (2 employees)
    { id: 12, name: 'Andy Yang', email: 'andy@soenaudio.com', role: 'employee', managerId: 2 },
    { id: 13, name: 'Jacky Wu', email: 'jacky@soenaudio.com', role: 'employee', managerId: 2 }
  ]
};

// Helper function to get all employees
function getAllEmployees() {
  return [
    ...EMPLOYEE_STRUCTURE.owners,
    ...EMPLOYEE_STRUCTURE.managers,
    ...EMPLOYEE_STRUCTURE.employees
  ];
}

// Helper function to find employee by email
function findEmployeeByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  return getAllEmployees().find(emp => emp.email.toLowerCase() === normalizedEmail);
}

// ==================== EMAIL SENDING FUNCTIONS ====================

async function sendEmail(to, subject, html) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('📧 Email would be sent to:', to);
    console.log('Subject:', subject);
    return { success: false, message: 'SendGrid not configured' };
  }

  try {
    const msg = {
      to: to,
      from: SENDER_EMAIL,
      subject: subject,
      html: html
    };

    await sgMail.send(msg);
    console.log(`✅ Email sent successfully to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    if (error.response) {
      console.error(error.response.body);
    }
    return { success: false, error: error.message };
  }
}

async function sendLeaveApplicationEmail(leave, employee, manager) {
  const subject = `New Leave Application from ${employee.name}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #F17926;">New Leave Application</h2>
      
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Employee:</strong> ${employee.name}</p>
        <p><strong>Email:</strong> ${employee.email}</p>
        <p><strong>Leave Type:</strong> ${leave.leave_type}</p>
        <p><strong>Start Date:</strong> ${leave.start_date}</p>
        <p><strong>End Date:</strong> ${leave.end_date}</p>
        <p><strong>Days Requested:</strong> ${leave.days_requested}</p>
        <p><strong>Reason:</strong> ${leave.reason}</p>
      </div>
      
      <p>Please review and approve/reject this leave application in the <a href="${process.env.FRONTEND_URL || 'https://soenaudio.netlify.app'}">Leave Management System</a>.</p>
      
      <p style="color: #666; font-size: 12px;">This is an automated email from SOEN Audio Leave Management System.</p>
    </div>
  `;

  return await sendEmail(manager.email, subject, html);
}

async function sendLeaveApprovalEmail(leave, employee) {
  const subject = `Your Leave Application has been Approved`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #28a745;">Leave Approved ✅</h2>
      
      <p>Dear ${employee.name},</p>
      
      <p>Your leave application has been <strong>approved</strong>.</p>
      
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Leave Type:</strong> ${leave.leave_type}</p>
        <p><strong>Start Date:</strong> ${leave.start_date}</p>
        <p><strong>End Date:</strong> ${leave.end_date}</p>
        <p><strong>Days:</strong> ${leave.days_requested}</p>
      </div>
      
      <p>Your leave balance has been updated accordingly.</p>
      
      <p style="color: #666; font-size: 12px;">This is an automated email from SOEN Audio Leave Management System.</p>
    </div>
  `;

  return await sendEmail(employee.email, subject, html);
}

async function sendLeaveRejectionEmail(leave, employee, reason) {
  const subject = `Your Leave Application has been Rejected`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc3545;">Leave Rejected ❌</h2>
      
      <p>Dear ${employee.name},</p>
      
      <p>Your leave application has been <strong>rejected</strong>.</p>
      
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Leave Type:</strong> ${leave.leave_type}</p>
        <p><strong>Start Date:</strong> ${leave.start_date}</p>
        <p><strong>End Date:</strong> ${leave.end_date}</p>
        <p><strong>Days:</strong> ${leave.days_requested}</p>
        ${reason ? `<p><strong>Reason for Rejection:</strong> ${reason}</p>` : ''}
      </div>
      
      <p>If you have any questions, please contact your manager.</p>
      
      <p style="color: #666; font-size: 12px;">This is an automated email from SOEN Audio Leave Management System.</p>
    </div>
  `;

  return await sendEmail(employee.email, subject, html);
}

// ==================== EMAIL/PASSWORD LOGIN ====================

// Email/Password Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt for:', email);

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    // Find employee by email
    const result = await pool.query(
      'SELECT * FROM employees WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (result.rows.length === 0) {
      console.log('Login failed: User not found');
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    const employee = result.rows[0];

    // Check if password is set
    if (!employee.password) {
      console.log('Login failed: No password set for this user');
      return res.status(401).json({ 
        success: false, 
        message: 'No password set. Please use "Forgot Password?" or login with Microsoft.' 
      });
    }

    // Verify password (plain text comparison for now)
    if (employee.password !== password) {
      console.log('Login failed: Incorrect password');
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Success! Return employee data
    console.log('Login successful for:', email);

    res.json({
      success: true,
      message: 'Login successful',
      employee: {
        id: employee.id,
        empNumber: employee.emp_number,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        managerId: employee.manager_id,
        leavesEntitled: employee.leaves_entitled,
        leavesTaken: employee.leaves_taken,
        casualLeave: employee.casual_leave,
        sickLeave: employee.sick_leave,
        earnedLeave: employee.earned_leave,
        privilegeLeave: employee.privilege_leave,
        work_location: employee.work_location,
        workLocation: employee.work_location,
        date_of_joining: employee.date_of_joining,
        sick_leaves_taken_ytd: employee.sick_leaves_taken_ytd
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});


// ==================== MICROSOFT OAUTH ====================

app.post('/api/auth/microsoft/callback', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log('🔐 Microsoft OAuth callback received for:', email);

    // Find employee in our structure
    const employeeInStructure = findEmployeeByEmail(email);
    
    if (!employeeInStructure) {
      console.log('❌ Employee not found in structure:', email);
      return res.status(404).json({ error: 'Employee not found in organization' });
    }

    console.log('✅ Employee found in structure:', employeeInStructure.name);

    // Check if employee exists in database
    const result = await pool.query(
      'SELECT * FROM employees WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    let userData;

    if (result.rows.length === 0) {
      // Employee exists in structure but not in database - auto-create
      console.log('📝 Creating employee in database:', email);
      
      const insertResult = await pool.query(`
        INSERT INTO employees (
          emp_number, username, name, email, role, manager_id,
          working_days, holidays, leaves_entitled, leaves_taken,
          casual_leave, sick_leave, earned_leave, privilege_leave
        ) VALUES ($1, $2, $3, $4, $5, $6, 260, 15, $7, 0, 4, 4, 4, 4)
        RETURNING *
      `, [
        `EMP${employeeInStructure.id.toString().padStart(3, '0')}`,
        employeeInStructure.name.toLowerCase().split(' ')[0],
        employeeInStructure.name,
        employeeInStructure.email,
        employeeInStructure.role,
        employeeInStructure.managerId,
        employeeInStructure.role === 'owner' ? 30 : employeeInStructure.role === 'admin' ? 25 : 20
      ]);

      userData = insertResult.rows[0];
      console.log('✅ Employee created in database');
    } else {
      userData = result.rows[0];
      console.log('✅ Employee found in database');
    }

    // Find manager details
    let managerData = null;
    if (userData.manager_id) {
      const managerResult = await pool.query(
        'SELECT * FROM employees WHERE id = $1',
        [userData.manager_id]
      );
      if (managerResult.rows.length > 0) {
        managerData = managerResult.rows[0];
      }
    }

    res.json({
      success: true,
      user: {
        id: userData.id,
        empNumber: userData.emp_number,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        managerId: userData.manager_id,
        managerName: managerData ? managerData.name : null,
        workingDays: userData.working_days,
        holidays: userData.holidays,
        leavesEntitled: userData.leaves_entitled,
        leavesTaken: userData.leaves_taken,
        leavesRemaining: userData.leaves_entitled - userData.leaves_taken,
        casualLeave: userData.casual_leave,
        sickLeave: userData.sick_leave,
        earnedLeave: userData.earned_leave,
        privilegeLeave: userData.privilege_leave,
        work_location: userData.work_location,
        workLocation: userData.work_location,
        date_of_joining: userData.date_of_joining,
        sick_leaves_taken_ytd: userData.sick_leaves_taken_ytd
      }
    });
  } catch (error) {
    console.error('❌ Error in Microsoft OAuth:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== PASSWORD RESET ENDPOINTS ====================


// Store reset tokens (in production, use Redis or database table)
const resetTokens = new Map();

// Request Password Reset
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    console.log('Password reset requested for:', email);

    // Check if employee exists
    const result = await pool.query(
      'SELECT * FROM employees WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (result.rows.length === 0) {
      // For security, dont reveal if email exists
      return res.json({ message: 'If that email exists, a reset link has been sent' });
    }

    const employee = result.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = Date.now() + 3600000; // 1 hour

    // Store token
    resetTokens.set(resetToken, {
      email: employee.email,
      expiry: resetExpiry
    });

    // Create reset link
    const resetLink = `https://soenaudio.netlify.app/reset-password.html?token=${resetToken}`;

    // Send email
    const subject = 'Password Reset Request - SOEN Audio';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #F17926;">Password Reset Request</h2>
        
        <p>Hello ${employee.name},</p>
        
        <p>We received a request to reset your password for your SOEN Audio Leave Management account.</p>
        
        <p>Click the button below to reset your password:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #F17926; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p>Or copy and paste this link into your browser:</p>
        <p style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">
          ${resetLink}
        </p>
        
        <p style="color: #dc3545; margin-top: 20px;">
          <strong>This link will expire in 1 hour.</strong>
        </p>
        
        <p>If you did not request this password reset, please ignore this email or contact rajesh@soenaudio.com if you have concerns.</p>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          This is an automated email from SOEN Audio Leave Management System.
        </p>
      </div>
    `;

    const emailResult = await sendEmail(employee.email, subject, html);

    if (emailResult.success) {
      console.log('Password reset email sent to:', employee.email);
      res.json({ message: 'Password reset link sent to your email' });
    } else {
      console.error('Failed to send reset email');
      res.status(500).json({ message: 'Failed to send reset email' });
    }

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify Reset Token
app.get('/api/auth/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const tokenData = resetTokens.get(token);

    if (!tokenData) {
      return res.status(400).json({ valid: false, message: 'Invalid or expired token' });
    }

    if (Date.now() > tokenData.expiry) {
      resetTokens.delete(token);
      return res.status(400).json({ valid: false, message: 'Token has expired' });
    }

    res.json({ valid: true, email: tokenData.email });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ valid: false, message: 'Server error' });
  }
});

// Complete Password Reset
app.post('/api/auth/complete-reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const tokenData = resetTokens.get(token);

    if (!tokenData) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    if (Date.now() > tokenData.expiry) {
      resetTokens.delete(token);
      return res.status(400).json({ message: 'Token has expired' });
    }

    // Update password in database
    await pool.query(
      'UPDATE employees SET password = $1 WHERE LOWER(email) = LOWER($2)',
      [newPassword, tokenData.email]
    );

    // Delete used token
    resetTokens.delete(token);

    console.log('Password reset completed for:', tokenData.email);

    res.json({ message: 'Password reset successful' });

  } catch (error) {
    console.error('Password reset completion error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Change Password (for logged-in users)
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    console.log('Password change requested for:', email);

    // Verify current password
    const result = await pool.query(
      'SELECT * FROM employees WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const employee = result.rows[0];

    // Check current password
    if (employee.password !== currentPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Update to new password
    await pool.query(
      'UPDATE employees SET password = $1 WHERE id = $2',
      [newPassword, employee.id]
    );

    console.log('Password changed successfully for:', email);

    // Send confirmation email
    const subject = 'Password Changed - SOEN Audio';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">Password Changed Successfully</h2>
        
        <p>Hello ${employee.name},</p>
        
        <p>Your password has been changed successfully.</p>
        
        <p>If you did not make this change, please contact rajesh@soenaudio.com immediately.</p>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          This is an automated email from SOEN Audio Leave Management System.
        </p>
      </div>
    `;

    await sendEmail(employee.email, subject, html);

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
app.get('/api/employees', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.*,
        m.name as manager_name,
        (e.leaves_entitled - e.leaves_taken) as leaves_remaining
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      ORDER BY e.id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

app.get('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        e.*,
        m.name as manager_name,
        (e.leaves_entitled - e.leaves_taken) as leaves_remaining
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// ==================== ADMIN: CREATE EMPLOYEE ====================

app.post('/api/employees', async (req, res) => {
  try {
    const {
      empNumber,
      username,
      name,
      email,
      role,
      managerId,
      workingDays,
      holidays,
      dateOfJoining,
      workLocation,
      annualElEntitlement,
      probationMonths,
      leavesEntitled,
      casualLeave,
      sickLeave,
      earnedLeave,
      privilegeLeave,
      maternityLeave,
      paternityLeave,
      compensatoryOff
    } = req.body;

    console.log('📝 Creating new employee:', { name, email, role, workLocation, dateOfJoining });

    // Validate work_location is set (mandatory)
    if (!workLocation || !['india', 'outside_india'].includes(workLocation)) {
      return res.status(400).json({ 
        error: 'Work location is required. Must be either "india" or "outside_india".' 
      });
    }

    // Validate date_of_joining is set (mandatory now)
    if (!dateOfJoining) {
      return res.status(400).json({ 
        error: 'Date of Joining is required for accurate leave calculation.' 
      });
    }

    // Check if email already exists
    const emailCheck = await pool.query('SELECT id FROM employees WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Check if emp_number already exists
    if (empNumber) {
      const empNumCheck = await pool.query('SELECT id FROM employees WHERE emp_number = $1', [empNumber]);
      if (empNumCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Employee number already exists' });
      }
    }

    // For non-India employees, force EL fields to 0
    const finalEarnedLeave = workLocation === 'india' ? (earnedLeave || 0) : 0;
    const finalAnnualEl = workLocation === 'india' ? (annualElEntitlement || 12) : 0;

    const insertQuery = `
      INSERT INTO employees (
        emp_number, username, name, email, role, manager_id,
        working_days, holidays, date_of_joining, work_location,
        annual_el_entitlement, probation_months,
        leaves_entitled, leaves_taken,
        casual_leave, sick_leave, earned_leave, privilege_leave,
        maternity_leave, paternity_leave, compensatory_off, leave_without_pay
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, $14, $15, $16, $17, $18, $19, 0, 0)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      empNumber,
      username,
      name,
      email,
      role,
      managerId || null,
      workingDays || 252,
      holidays || 12,
      dateOfJoining,
      workLocation,
      finalAnnualEl,
      probationMonths || 0,
      leavesEntitled || 12,
      casualLeave || 12,
      sickLeave || 0,
      finalEarnedLeave,
      privilegeLeave || 0,
      maternityLeave || 0,
      paternityLeave || 0
    ]);

    console.log('✅ Employee created successfully:', result.rows[0].id);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating employee:', error);
    res.status(500).json({ error: 'Failed to create employee', details: error.message });
  }
});

// ==================== ADMIN: UPDATE EMPLOYEE ====================

app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      empNumber,
      username,
      name,
      email,
      role,
      managerId,
      workingDays,
      holidays,
      dateOfJoining,
      workLocation,
      annualElEntitlement,
      probationMonths,
      leavesEntitled,
      leavesTaken,
      casualLeave,
      sickLeave,
      earnedLeave,
      privilegeLeave,
      maternityLeave,
      paternityLeave,
      compensatoryOff,
      leaveWithoutPay
    } = req.body;

    console.log('📝 Updating employee:', id, 'Location:', workLocation, 'DOJ:', dateOfJoining);

    // Validate work_location
    if (!workLocation || !['india', 'outside_india'].includes(workLocation)) {
      return res.status(400).json({ 
        error: 'Work location is required. Must be either "india" or "outside_india".' 
      });
    }

    // Validate date_of_joining
    if (!dateOfJoining) {
      return res.status(400).json({ 
        error: 'Date of Joining is required.' 
      });
    }

    // Check if employee exists
    const empCheck = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const existingEmployee = empCheck.rows[0];

    // Check if email is being changed to an existing one
    const emailCheck = await pool.query('SELECT id FROM employees WHERE email = $1 AND id != $2', [email, id]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // If location changed from india to outside_india, preserve EL history
    if (existingEmployee.work_location === 'india' && workLocation === 'outside_india') {
      const historyEntry = {
        event: 'work_location_changed_to_outside_india',
        date: new Date().toISOString().split('T')[0],
        previous_earned_leave: existingEmployee.earned_leave,
        previous_carried_forward: existingEmployee.carried_forward_leave,
        previous_el_balance: existingEmployee.previous_earned_leave,
        reason: 'Work location changed - EL no longer applicable',
        timestamp: new Date().toISOString()
      };
      
      await pool.query(`
        UPDATE employees 
        SET el_history_log = COALESCE(el_history_log, '[]'::jsonb) || $1::jsonb
        WHERE id = $2
      `, [JSON.stringify([historyEntry]), id]);
    }

    // For non-India employees, force EL fields to 0
    const finalEarnedLeave = workLocation === 'india' ? (earnedLeave || 0) : 0;
    const finalAnnualEl = workLocation === 'india' ? (annualElEntitlement || 12) : 0;

    const updateQuery = `
      UPDATE employees SET
        emp_number = $1,
        username = $2,
        name = $3,
        email = $4,
        role = $5,
        manager_id = $6,
        working_days = $7,
        holidays = $8,
        date_of_joining = $9,
        work_location = $10,
        annual_el_entitlement = $11,
        probation_months = $12,
        leaves_entitled = $13,
        leaves_taken = $14,
        casual_leave = $15,
        sick_leave = $16,
        earned_leave = $17,
        privilege_leave = $18,
        maternity_leave = $19,
        paternity_leave = $20,
        compensatory_off = 0,
        leave_without_pay = $21,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $22
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [
      empNumber,
      username,
      name,
      email,
      role,
      managerId || null,
      workingDays || 252,
      holidays || 12,
      dateOfJoining,
      workLocation,
      finalAnnualEl,
      probationMonths || 0,
      leavesEntitled || 12,
      leavesTaken || 0,
      casualLeave || 0,
      sickLeave || 0,
      finalEarnedLeave,
      privilegeLeave || 0,
      maternityLeave || 0,
      paternityLeave || 0,
      leaveWithoutPay || 0,
      id
    ]);

    console.log('✅ Employee updated successfully:', id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee', details: error.message });
  }
});

// ==================== ADMIN: DELETE EMPLOYEE ====================

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️  Deleting employee:', id);

    // Check if employee exists
    const empCheck = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check if employee has pending leave applications
    const leaveCheck = await pool.query(
      'SELECT COUNT(*) as count FROM leave_applications WHERE employee_id = $1 AND status = $2',
      [id, 'pending']
    );

    if (parseInt(leaveCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete employee with pending leave applications. Please resolve them first.' 
      });
    }

    // Check if employee is a manager
    const managerCheck = await pool.query(
      'SELECT COUNT(*) as count FROM employees WHERE manager_id = $1',
      [id]
    );

    if (parseInt(managerCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete employee who is managing other employees. Please reassign their team first.' 
      });
    }

    // Delete employee (CASCADE will handle leave applications)
    await pool.query('DELETE FROM employees WHERE id = $1', [id]);

    console.log('✅ Employee deleted successfully:', id);
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee', details: error.message });
  }
});

// ==================== LEAVE APPLICATIONS ====================

app.post('/api/leave-applications', async (req, res) => {
  try {
    const {
      employeeId,
      leaveType,
      startDate,
      endDate,
      daysRequested,
      reason
    } = req.body;

    console.log('📝 New leave application:', { employeeId, leaveType, startDate, endDate, daysRequested, reason });

    // Validate inputs
    if (!employeeId || !leaveType || !startDate || !endDate || !daysRequested || !reason) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if employee exists
    const employeeCheck = await pool.query('SELECT * FROM employees WHERE id = $1', [employeeId]);
    if (employeeCheck.rows.length === 0) {
      console.error('❌ Employee not found:', employeeId);
      return res.status(404).json({ error: 'Employee not found' });
    }

    console.log('✅ Employee found:', employeeCheck.rows[0].name);

    // Insert leave application
    const insertQuery = `
      INSERT INTO leave_applications (
        employee_id, leave_type, start_date, end_date, 
        days_requested, reason, status, applied_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP)
      RETURNING *
    `;

    console.log('💾 Inserting into database...');
    const result = await pool.query(insertQuery, [
      employeeId, leaveType, startDate, endDate, daysRequested, reason
    ]);

    const leaveApplication = result.rows[0];
    console.log('✅ Leave record created:', leaveApplication.id);

    // Get employee details
    const employee = employeeCheck.rows[0];

    // Get manager details and send email
    if (employee.manager_id) {
      console.log('📧 Finding manager with ID:', employee.manager_id);
      const managerResult = await pool.query('SELECT * FROM employees WHERE id = $1', [employee.manager_id]);
      if (managerResult.rows.length > 0) {
        const manager = managerResult.rows[0];
        console.log('✅ Manager found:', manager.name, manager.email);
        
        // Send email to manager
        try {
          await sendLeaveApplicationEmail(leaveApplication, employee, manager);
          console.log('✅ Email sent to manager');
        } catch (emailError) {
          console.error('⚠️  Email failed but leave created:', emailError.message);
          // Don't fail the request if email fails
        }
      } else {
        console.warn('⚠️  Manager not found for ID:', employee.manager_id);
      }
    } else {
      console.log('ℹ️  Employee has no manager (probably an owner)');
    }

    console.log('✅ Leave application created successfully');
    res.status(201).json(leaveApplication);
  } catch (error) {
    console.error('❌ Error creating leave application:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to create leave application',
      details: error.message 
    });
  }
});

app.get('/api/leave-applications', async (req, res) => {
  try {
    const { employeeId, managerId, status } = req.query;
    
    let query = `
      SELECT 
        la.*,
        e.name as employee_name,
        e.email as employee_email,
        e.manager_id,
        m.name as manager_name
      FROM leave_applications la
      JOIN employees e ON la.employee_id = e.id
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE 1=1
    `;
    const params = [];
    
    if (employeeId) {
      params.push(employeeId);
      query += ` AND la.employee_id = $${params.length}`;
    }
    
    if (managerId) {
      params.push(managerId);
      query += ` AND e.manager_id = $${params.length}`;
    }
    
    if (status) {
      params.push(status);
      query += ` AND la.status = $${params.length}`;
    }
    
    query += ' ORDER BY la.applied_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching leave applications:', error);
    res.status(500).json({ error: 'Failed to fetch leave applications' });
  }
});

app.patch('/api/leave-applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, approvedBy, rejectionReason } = req.body;

    console.log(`📝 Updating leave application ${id} to status: ${status}`);

    // Get leave application details first
    const leaveResult = await pool.query(
      'SELECT la.*, e.* FROM leave_applications la JOIN employees e ON la.employee_id = e.id WHERE la.id = $1',
      [id]
    );
    
    if (leaveResult.rows.length === 0) {
      return res.status(404).json({ error: 'Leave application not found' });
    }
    
    const leave = leaveResult.rows[0];
    
    // Update leave application
    const updateQuery = `
      UPDATE leave_applications 
      SET status = $1, 
          approved_by = $2, 
          rejection_reason = $3,
          approved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
    
    const result = await pool.query(updateQuery, [
      status, 
      approvedBy, 
      status === 'rejected' ? rejectionReason : null,
      id
    ]);
    
    // If approved, update employee's leave balance
    if (status === 'approved') {
      await pool.query(`
        UPDATE employees 
        SET leaves_taken = leaves_taken + $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [leave.days_requested, leave.employee_id]);
      
      // Send approval email
      await sendLeaveApprovalEmail(result.rows[0], leave);
      
      console.log('✅ Leave approved and balance updated');
    } else if (status === 'rejected') {
      // Send rejection email
      await sendLeaveRejectionEmail(result.rows[0], leave, rejectionReason);
      
      console.log('❌ Leave rejected');
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating leave application:', error);
    res.status(500).json({ error: 'Failed to update leave application' });
  }
});

// ==================== ANALYTICS ====================

app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    // Total employees
    const totalEmployees = await pool.query('SELECT COUNT(*) as count FROM employees');
    
    // Leave applications by status
    const leaveStats = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM leave_applications 
      GROUP BY status
    `);
    
    // Employees by role
    const roleDistribution = await pool.query(`
      SELECT role, COUNT(*) as count 
      FROM employees 
      GROUP BY role
    `);
    
    // Leave balance summary
    const leaveBalance = await pool.query(`
      SELECT 
        SUM(leaves_entitled) as total_entitled,
        SUM(leaves_taken) as total_taken,
        SUM(leaves_entitled - leaves_taken) as total_remaining
      FROM employees
    `);
    
    res.json({
      totalEmployees: parseInt(totalEmployees.rows[0].count),
      leaveApplications: leaveStats.rows,
      roleDistribution: roleDistribution.rows,
      leaveBalance: leaveBalance.rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    totalEmployees: getAllEmployees().length,
    sendgridConfigured: !!process.env.SENDGRID_API_KEY
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'SOEN Leave Management API',
    version: '2.1 - With Email Notifications',
    endpoints: {
      auth: '/api/auth/*',
      employees: '/api/employees',
      leaves: '/api/leave-applications',
      analytics: '/api/analytics/dashboard'
    },
    emailsEnabled: !!process.env.SENDGRID_API_KEY
  });
});


// ==================== NEW FEATURES - BACKEND ENDPOINTS ====================
// Add these to your server.js file (after the existing endpoints)

// ==================== ADMIN ACTIVITY LOG ====================

// Helper function to log admin actions
async function logAdminAction(adminId, adminName, adminEmail, actionType, actionDescription, targetEmployeeId = null, targetEmployeeName = null, beforeValue = null, afterValue = null) {
  try {
    await pool.query(
      `INSERT INTO admin_logs (
        admin_id, admin_name, admin_email, action_type, action_description,
        target_employee_id, target_employee_name, before_value, after_value
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [adminId, adminName, adminEmail, actionType, actionDescription, targetEmployeeId, targetEmployeeName, beforeValue, afterValue]
    );
    console.log(`✅ Admin action logged: ${actionType} by ${adminName}`);
  } catch (error) {
    console.error('❌ Error logging admin action:', error);
  }
}

// Get admin logs (with pagination and filtering)
app.get('/api/admin/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, actionType, adminId, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        al.*,
        e.emp_number as admin_emp_number
      FROM admin_logs al
      LEFT JOIN employees e ON al.admin_id = e.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (actionType) {
      paramCount++;
      query += ` AND al.action_type = $${paramCount}`;
      params.push(actionType);
    }

    if (adminId) {
      paramCount++;
      query += ` AND al.admin_id = $${paramCount}`;
      params.push(adminId);
    }

    if (startDate) {
      paramCount++;
      query += ` AND al.created_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND al.created_at <= $${paramCount}`;
      params.push(endDate);
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM admin_logs WHERE 1=1`;
    const countResult = await pool.query(countQuery);

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    });

  } catch (error) {
    console.error('❌ Error fetching admin logs:', error);
    res.status(500).json({ message: 'Failed to fetch admin logs' });
  }
});


// ==================== UPDATED RESET LEAVES ENDPOINT ====================
// Replace the existing /api/admin/reset-leaves endpoint with this

app.post('/api/admin/reset-leaves', async (req, res) => {
  try {
    const { adminId, adminName, adminEmail } = req.body;

    console.log('🔄 Reset All Leaves initiated by:', adminName);

    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Delete ALL leave applications
      const deleteResult = await client.query('DELETE FROM leave_applications');
      const deletedCount = deleteResult.rowCount;

      // 2. Reset leave balances to 0 (EXCEPT earned_leave)
      const updateResult = await client.query(`
        UPDATE employees 
        SET 
          casual_leave = 0,
          sick_leave = 0,
          privilege_leave = 0,
          leaves_taken = 0,
          leaves_entitled = 0
        WHERE 1=1
      `);
      
      const affectedEmployees = updateResult.rowCount;

      // 3. Log the action
      await client.query(`
        INSERT INTO admin_logs (
          admin_id, admin_name, admin_email, 
          action_type, action_description, 
          target_employee_id, target_employee_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        adminId, 
        adminName, 
        adminEmail,
        'RESET_LEAVES',
        `Reset all leave balances to 0 (kept earned leaves). Deleted ${deletedCount} leave applications. Affected ${affectedEmployees} employees.`,
        null,
        'All Employees'
      ]);

      await client.query('COMMIT');

      console.log('✅ Reset completed:', {
        deletedApplications: deletedCount,
        affectedEmployees: affectedEmployees
      });

      res.json({
        success: true,
        message: 'All leaves reset successfully. CL, SL, and Comp Off set to 0. Earned leaves kept unchanged.',
        deletedApplications: deletedCount,
        affectedEmployees: affectedEmployees
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Error resetting leaves:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset leaves: ' + error.message
    });
  }
});


// ==================== CARRY FORWARD EARNED LEAVES ====================

app.post('/api/admin/carryforward-leaves', async (req, res) => {
  try {
    const { adminId, adminName, adminEmail, newYear } = req.body;

    console.log(`🔄 Carrying forward earned leaves to year ${newYear}...`);

    // Get all employees with their current earned leave
    const employeesResult = await pool.query(`
      SELECT id, name, emp_number, earned_leave, carried_forward_leave
      FROM employees
    `);

    const updates = [];

    for (const emp of employeesResult.rows) {
      // Store current earned leave as previous
      const currentEarned = emp.earned_leave || 0;
      const currentCarried = emp.carried_forward_leave || 0;
      const totalToCarry = currentEarned + currentCarried;

      // Update employee: carry forward earned leaves, reset other leaves
      await pool.query(`
        UPDATE employees SET
          previous_earned_leave = earned_leave,
          carried_forward_leave = $1,
          earned_leave = 4,
          casual_leave = 4,
          sick_leave = 4,
          privilege_leave = 4,
          leaves_taken = 0,
          leave_year = $2
        WHERE id = $3
      `, [totalToCarry, newYear, emp.id]);

      updates.push({
        empNumber: emp.emp_number,
        name: emp.name,
        carriedForward: totalToCarry
      });

      // Log individual carry forward
      await logAdminAction(
        adminId,
        adminName,
        adminEmail,
        'LEAVE_CARRYFORWARD',
        `Carried forward ${totalToCarry} earned leave days to year ${newYear}`,
        emp.id,
        emp.name,
        `Earned: ${currentEarned}, Carried: ${currentCarried}`,
        `New carried forward: ${totalToCarry}, Reset other leaves to 4`
      );
    }

    console.log(`✅ Carried forward earned leaves for ${updates.length} employees`);

    // Update system settings
    await pool.query(
      `UPDATE system_settings 
       SET setting_value = $1, updated_by = $2, updated_at = NOW()
       WHERE setting_key = 'current_leave_year'`,
      [newYear.toString(), adminId]
    );

    res.json({
      success: true,
      message: `Earned leaves carried forward to ${newYear} successfully`,
      updates: updates,
      totalEmployees: updates.length
    });

  } catch (error) {
    console.error('❌ Error carrying forward leaves:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to carry forward leaves' 
    });
  }
});


// ==================== EXPORT EMPLOYEES TO EXCEL ====================

app.get('/api/admin/export-employees', async (req, res) => {
  try {
    const { adminId, adminName, adminEmail } = req.query;

    console.log('📊 Exporting employee data...');

    // Get all employee data with manager names
    const result = await pool.query(`
      SELECT 
        e.emp_number,
        e.name,
        e.email,
        e.role,
        m.name as manager_name,
        e.leaves_entitled,
        e.leaves_taken,
        e.casual_leave,
        e.sick_leave,
        e.earned_leave,
        e.privilege_leave,
        e.carried_forward_leave,
        e.previous_earned_leave,
        e.leave_year,
        e.working_days,
        e.holidays,
        e.created_at
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      ORDER BY e.emp_number
    `);

    // Log the export action
    if (adminId) {
      await logAdminAction(
        parseInt(adminId),
        adminName,
        adminEmail,
        'EXPORT_DATA',
        `Exported ${result.rows.length} employee records to Excel`,
        null,
        null,
        null,
        `${result.rows.length} records exported`
      );
    }

    // Return data as JSON (will be converted to Excel on frontend)
    res.json({
      success: true,
      data: result.rows,
      timestamp: new Date().toISOString(),
      totalRecords: result.rows.length
    });

  } catch (error) {
    console.error('❌ Error exporting employees:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to export employee data' 
    });
  }
});


// ==================== GET SYSTEM SETTINGS ====================

app.get('/api/admin/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings');
    
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = {
        value: row.setting_value,
        description: row.description,
        updatedAt: row.updated_at
      };
    });

    res.json({ success: true, settings });

  } catch (error) {
    console.error('❌ Error fetching settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch settings' 
    });
  }
});


// ==================== ENHANCED EMPLOYEE UPDATE WITH LOGGING ====================

// Update the existing employee update endpoint to include logging
// Replace your existing PUT /api/employees/:id endpoint with this:

app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const { adminId, adminName, adminEmail } = req.headers; // Pass admin info in headers

    // Get current employee data for comparison
    const beforeResult = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
    const beforeData = beforeResult.rows[0];

    // Build update query dynamically based on provided fields
    const fields = [];
    const values = [];
    let paramCount = 0;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined && key !== 'id') {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE employees SET ${fields.join(', ')} WHERE id = $${paramCount + 1} RETURNING *`;

    const result = await pool.query(query, values);
    const afterData = result.rows[0];

    // Log the changes
    if (adminId) {
      const changes = [];
      Object.keys(updates).forEach(key => {
        if (beforeData[key] !== afterData[key]) {
          changes.push(`${key}: ${beforeData[key]} → ${afterData[key]}`);
        }
      });

      await logAdminAction(
        parseInt(adminId),
        adminName,
        adminEmail,
        'EMPLOYEE_UPDATE',
        `Updated employee details: ${changes.join(', ')}`,
        parseInt(id),
        afterData.name,
        JSON.stringify(beforeData),
        JSON.stringify(afterData)
      );
    }

    console.log('✅ Employee updated:', afterData.name);

    res.json({
      success: true,
      message: 'Employee updated successfully',
      employee: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error updating employee:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update employee' 
    });
  }
});




// ==================== STAGE 2: HOLIDAYS & EL CALCULATION ENDPOINTS ====================

// Get all public holidays for a year
app.get('/api/holidays', async (req, res) => {
  try {
    const { year, country = 'india' } = req.query;
    let query = 'SELECT * FROM public_holidays WHERE country = $1';
    const params = [country];
    
    if (year) {
      query += ' AND year = $2';
      params.push(parseInt(year));
    }
    
    query += ' ORDER BY holiday_date';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching holidays:', error);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

// Add a single holiday (admin)
app.post('/api/admin/holidays', async (req, res) => {
  try {
    const { holiday_date, holiday_name, country = 'india', adminEmail } = req.body;
    
    if (!holiday_date || !holiday_name) {
      return res.status(400).json({ error: 'Date and name are required' });
    }
    
    const year = new Date(holiday_date).getFullYear();
    
    const result = await pool.query(`
      INSERT INTO public_holidays (holiday_date, holiday_name, country, year, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (holiday_date, country) 
      DO UPDATE SET holiday_name = $2, created_by = $5
      RETURNING *
    `, [holiday_date, holiday_name, country, year, adminEmail || 'admin']);
    
    console.log('✅ Holiday added:', holiday_date, holiday_name);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error adding holiday:', error);
    res.status(500).json({ error: 'Failed to add holiday', details: error.message });
  }
});

// Bulk upload holidays (CSV format expected as array)
app.post('/api/admin/holidays/bulk', async (req, res) => {
  try {
    const { holidays, country = 'india', adminEmail } = req.body;
    
    if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({ error: 'holidays array is required' });
    }
    
    let added = 0;
    let updated = 0;
    
    for (const h of holidays) {
      const year = new Date(h.holiday_date).getFullYear();
      const result = await pool.query(`
        INSERT INTO public_holidays (holiday_date, holiday_name, country, year, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (holiday_date, country) 
        DO UPDATE SET holiday_name = $2, created_by = $5
        RETURNING (xmax = 0) as is_insert
      `, [h.holiday_date, h.holiday_name, country, year, adminEmail || 'admin']);
      
      if (result.rows[0].is_insert) added++;
      else updated++;
    }
    
    console.log(`✅ Bulk holidays: ${added} added, ${updated} updated`);
    res.json({ success: true, added, updated, total: holidays.length });
  } catch (error) {
    console.error('❌ Error bulk uploading holidays:', error);
    res.status(500).json({ error: 'Failed to upload holidays', details: error.message });
  }
});

// Delete a holiday
app.delete('/api/admin/holidays/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM public_holidays WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error deleting holiday:', error);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

// Calculate working days between two dates
app.get('/api/working-days', async (req, res) => {
  try {
    const { start_date, end_date, country = 'india' } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date required' });
    }
    
    const result = await pool.query(
      'SELECT calculate_working_days($1::DATE, $2::DATE, $3) as working_days',
      [start_date, end_date, country]
    );
    
    res.json({ working_days: parseInt(result.rows[0].working_days) });
  } catch (error) {
    console.error('❌ Error calculating working days:', error);
    res.status(500).json({ error: 'Failed to calculate', details: error.message });
  }
});

// Get EL breakdown for an employee
app.get('/api/employees/:id/el-breakdown', async (req, res) => {
  try {
    const { id } = req.params;
    
    const empResult = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const emp = empResult.rows[0];
    
    if (emp.work_location !== 'india') {
      return res.json({
        eligible: false,
        reason: 'Earned Leave only applies to India-based employees',
        earned_leave: 0
      });
    }
    
    if (!emp.date_of_joining) {
      return res.json({
        eligible: false,
        reason: 'Date of Joining not set',
        earned_leave: 0
      });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    // Get working days
    const wdResult = await pool.query(
      'SELECT calculate_working_days($1::DATE, $2::DATE, $3) as wd',
      [emp.date_of_joining, today, 'india']
    );
    const workingDays = parseInt(wdResult.rows[0].wd);
    
    // Get holidays in period
    const holidaysResult = await pool.query(
      `SELECT COUNT(*) as count FROM public_holidays 
       WHERE country = 'india' 
       AND holiday_date BETWEEN $1 AND $2
       AND EXTRACT(DOW FROM holiday_date) NOT IN (0, 6)`,
      [emp.date_of_joining, today]
    );
    const holidayCount = parseInt(holidaysResult.rows[0].count);
    
    const elExact = workingDays / 20;
    const elRounded = Math.round(elExact);
    const elFinal = Math.min(elRounded, 30);
    
    res.json({
      eligible: true,
      employee: emp.name,
      date_of_joining: emp.date_of_joining,
      calculation_date: today,
      working_days: workingDays,
      holidays_excluded: holidayCount,
      el_exact: parseFloat(elExact.toFixed(2)),
      el_rounded: elRounded,
      el_final: elFinal,
      capped_at_30: elRounded > 30,
      formula: '1 EL per 20 working days (excluding weekends and India public holidays)'
    });
  } catch (error) {
    console.error('❌ Error calculating EL breakdown:', error);
    res.status(500).json({ error: 'Failed to calculate', details: error.message });
  }
});

// Manually trigger EL recalculation for all India employees
app.post('/api/admin/recalculate-el', async (req, res) => {
  try {
    const { adminEmail } = req.body;
    
    console.log('🔄 Recalculating EL for all India employees...');
    
    const result = await pool.query(`
      UPDATE employees 
      SET 
        earned_leave = calculate_employee_el(id, CURRENT_DATE)::INTEGER,
        el_accrued_total = calculate_employee_el(id, CURRENT_DATE),
        last_el_calculation_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP
      WHERE work_location = 'india' 
        AND date_of_joining IS NOT NULL
      RETURNING id, name, earned_leave, el_accrued_total
    `);
    
    // Log the action
    await pool.query(`
      INSERT INTO admin_logs (admin_name, admin_email, action_type, action_description)
      VALUES ($1, $2, 'EL_RECALCULATION', $3)
    `, [
      adminEmail || 'system',
      adminEmail || 'system@soenaudio.com',
      `Recalculated EL for ${result.rowCount} India employees`
    ]);
    
    console.log(`✅ EL recalculated for ${result.rowCount} employees`);
    res.json({
      success: true,
      employees_updated: result.rowCount,
      details: result.rows
    });
  } catch (error) {
    console.error('❌ Error recalculating EL:', error);
    res.status(500).json({ error: 'Failed to recalculate', details: error.message });
  }
});

// Get sick leave summary
app.get('/api/employees/:id/sick-leaves', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT name, sick_leaves_taken_ytd, work_location FROM employees WHERE id = $1',
      [id]
    );
    res.json(result.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});


// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log('🚀 ========================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('🚀 ========================================');
  console.log(`📊 Total Employees: ${getAllEmployees().length}`);
  console.log(`👑 Owners: ${EMPLOYEE_STRUCTURE.owners.length}`);
  console.log(`⚙️  Managers: ${EMPLOYEE_STRUCTURE.managers.length}`);
  console.log(`👤 Employees: ${EMPLOYEE_STRUCTURE.employees.length}`);
  console.log(`📧 SendGrid: ${process.env.SENDGRID_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log('🚀 ========================================');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, closing server...');
  pool.end(() => {
    console.log('💤 Database pool closed');
    process.exit(0);
  });
});
