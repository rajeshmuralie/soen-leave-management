const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

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
    // Reporting to Daniel (2 employees)
    { id: 12, name: 'Andy Yang', email: 'andy@soenaudio.com', role: 'employee', managerId: 2 },
    { id: 13, name: 'Jacky Wu', email: 'jacky@soenaudio.com', role: 'employee', managerId: 2 }
  ]
};

// Helper function to get all employees as flat array
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

// ==================== AUTHENTICATION ====================

// Microsoft OAuth callback endpoint
app.post('/api/auth/microsoft/callback', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log('🔐 Microsoft login attempt for:', email);

    // Find employee by email
    const employee = findEmployeeByEmail(email);
    
    if (!employee) {
      console.log('❌ Employee not found for email:', email);
      return res.status(404).json({ 
        error: 'Employee not found. Please contact administrator.' 
      });
    }

    // Fetch full employee data from database
    const dbQuery = 'SELECT * FROM employees WHERE LOWER(email) = LOWER($1)';
    const dbResult = await pool.query(dbQuery, [email]);
    
    if (dbResult.rows.length === 0) {
      console.log('⚠️  Employee found in structure but not in database:', email);
      console.log('📝 Creating employee record in database...');
      
      // Insert employee into database
      const insertQuery = `
        INSERT INTO employees (
          emp_number, username, name, email, role, manager_id,
          working_days, holidays, leaves_entitled, leaves_taken,
          casual_leave, sick_leave, earned_leave, privilege_leave,
          maternity_leave, paternity_leave, compensatory_off, leave_without_pay
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 260, 15, 
          $7, 0, 5, 5, 5, 5, 0, 0, 0, 0
        ) RETURNING *
      `;
      
      const empNumber = `EMP${String(employee.id).padStart(3, '0')}`;
      const username = employee.email.split('@')[0];
      const leavesEntitled = employee.role === 'owner' ? 30 : employee.role === 'admin' ? 25 : 20;
      
      const insertResult = await pool.query(insertQuery, [
        empNumber, username, employee.name, employee.email, 
        employee.role, employee.managerId, leavesEntitled
      ]);
      
      const userData = insertResult.rows[0];
      console.log('✅ Employee created in database:', userData.name);
      
      return res.json({
        success: true,
        user: {
          id: userData.id,
          empNumber: userData.emp_number,
          name: userData.name,
          email: userData.email,
          role: userData.role,
          managerId: userData.manager_id,
          leavesEntitled: userData.leaves_entitled,
          leavesTaken: userData.leaves_taken,
          leavesRemaining: userData.leaves_entitled - userData.leaves_taken
        }
      });
    }

    const userData = dbResult.rows[0];
    console.log('✅ Login successful:', userData.name, `(${userData.role})`);

    res.json({
      success: true,
      user: {
        id: userData.id,
        empNumber: userData.emp_number,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        managerId: userData.manager_id,
        leavesEntitled: userData.leaves_entitled,
        leavesTaken: userData.leaves_taken,
        leavesRemaining: userData.leaves_entitled - userData.leaves_taken,
        // Leave breakdown
        casualLeave: userData.casual_leave,
        sickLeave: userData.sick_leave,
        earnedLeave: userData.earned_leave,
        privilegeLeave: userData.privilege_leave,
        maternityLeave: userData.maternity_leave,
        paternityLeave: userData.paternity_leave,
        compensatoryOff: userData.compensatory_off,
        leaveWithoutPay: userData.leave_without_pay
      }
    });

  } catch (error) {
    console.error('❌ Microsoft auth error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});

// Regular login endpoint (for testing)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Regular login attempt for:', email);
    
    // Find employee in structure
    const employee = findEmployeeByEmail(email);
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // In production, validate password properly
    // For now, accept any password or 'password123'
    
    // Fetch from database
    const result = await pool.query(
      'SELECT * FROM employees WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found in database' });
    }

    const userData = result.rows[0];
    console.log('✅ Login successful:', userData.name);

    res.json({
      success: true,
      user: {
        id: userData.id,
        empNumber: userData.emp_number,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        managerId: userData.manager_id,
        leavesEntitled: userData.leaves_entitled,
        leavesTaken: userData.leaves_taken,
        leavesRemaining: userData.leaves_entitled - userData.leaves_taken
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// ==================== EMPLOYEES ====================

// Get all employees
app.get('/api/employees', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.*,
        (e.leaves_entitled - e.leaves_taken) as leaves_remaining,
        m.name as manager_name
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

// Get employee by ID
app.get('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        e.*,
        (e.leaves_entitled - e.leaves_taken) as leaves_remaining,
        m.name as manager_name
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

// Get team members (direct reports)
app.get('/api/employees/:id/team', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        e.*,
        (e.leaves_entitled - e.leaves_taken) as leaves_remaining
      FROM employees e
      WHERE e.manager_id = $1
      ORDER BY e.name
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching team:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// ==================== LEAVE APPLICATIONS ====================

// Get leave applications
app.get('/api/leave-applications', async (req, res) => {
  try {
    const { employeeId, managerId, status } = req.query;
    
    let query = `
      SELECT 
        la.*,
        e.name as employee_name,
        e.email as employee_email,
        e.role as employee_role,
        m.name as manager_name,
        a.name as approved_by_name
      FROM leave_applications la
      JOIN employees e ON la.employee_id = e.id
      LEFT JOIN employees m ON e.manager_id = m.id
      LEFT JOIN employees a ON la.approved_by = a.id
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
    
    query += ' ORDER BY la.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching leave applications:', error);
    res.status(500).json({ error: 'Failed to fetch leave applications' });
  }
});

// Create leave application
app.post('/api/leave-applications', async (req, res) => {
  try {
    const { employeeId, leaveType, startDate, endDate, daysRequested, reason } = req.body;
    
    // Validate employee exists
    const empCheck = await pool.query('SELECT * FROM employees WHERE id = $1', [employeeId]);
    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const employee = empCheck.rows[0];
    
    // Check leave balance
    const remainingLeaves = employee.leaves_entitled - employee.leaves_taken;
    if (daysRequested > remainingLeaves) {
      return res.status(400).json({ 
        error: 'Insufficient leave balance',
        available: remainingLeaves,
        requested: daysRequested
      });
    }
    
    // Insert leave application
    const result = await pool.query(`
      INSERT INTO leave_applications (
        employee_id, leave_type, start_date, end_date, 
        days_requested, reason, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *
    `, [employeeId, leaveType, startDate, endDate, daysRequested, reason]);
    
    console.log('✅ Leave application created:', result.rows[0].id);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating leave application:', error);
    res.status(500).json({ error: 'Failed to create leave application' });
  }
});

// Approve/Reject leave application
app.patch('/api/leave-applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, approvedBy, rejectionReason } = req.body;
    
    // Validate status
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Get leave application
    const leaveResult = await pool.query(
      'SELECT * FROM leave_applications WHERE id = $1',
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
      
      console.log('✅ Leave approved and balance updated');
    } else {
      console.log('❌ Leave rejected');
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating leave application:', error);
    res.status(500).json({ error: 'Failed to update leave application' });
  }
});

// ==================== ANALYTICS ====================

// Get dashboard stats for owners
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
    totalEmployees: getAllEmployees().length
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'SOEN Leave Management API',
    version: '2.0',
    endpoints: {
      auth: '/api/auth/*',
      employees: '/api/employees',
      leaves: '/api/leave-applications',
      analytics: '/api/analytics/dashboard'
    }
  });
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
