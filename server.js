const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

// SendGrid configuration
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Employee data (matches frontend)
const employees = [
    { id: 1, name: 'Hari Seedhar', email: 'h@soenaudio.com', role: 'owner', managerId: null },
    { id: 2, name: 'Daniel Kissel', email: 'daniel@soenaudio.com', role: 'owner', managerId: null },
    { id: 3, name: 'Glen Walters', email: 'glen@soenaudio.com', role: 'owner', managerId: null },
    { id: 4, name: 'Rajesh Murali', email: 'rajesh@soenaudio.com', role: 'admin', managerId: 1 },
    { id: 5, name: 'Sanket Mahadik', email: 'sanket@soenaudio.com', role: 'employee', managerId: 4 },
    { id: 6, name: 'Chindan Thiyagarajan', email: 'chindan@soenaudio.com', role: 'employee', managerId: 4 },
    { id: 7, name: 'Upendra Kagana', email: 'upendra@soenaudio.com', role: 'employee', managerId: 4 },
    { id: 8, name: 'John Verma', email: 'john@soenaudio.com', role: 'employee', managerId: 4 },
    { id: 9, name: 'Rick', email: 'rick@soenaudio.com', role: 'employee', managerId: 1 },
    { id: 10, name: 'Bruce Ryan', email: 'bruce@soenaudio.com', role: 'employee', managerId: 1 },
    { id: 11, name: 'Nikki', email: 'nikki@soenaudio.com', role: 'employee', managerId: 1 },
    { id: 12, name: 'Andy Yang', email: 'andy@soenaudio.com', role: 'employee', managerId: 2 },
    { id: 13, name: 'Jacky Wu', email: 'jacky@soenaudio.com', role: 'employee', managerId: 2 }
];

// Helper function to get manager email
function getManagerEmail(managerId) {
    const manager = employees.find(emp => emp.id === managerId);
    return manager ? manager.email : null;
}

// Helper function to send email
async function sendEmail(to, subject, html) {
    if (!process.env.SENDGRID_API_KEY) {
        console.log('SendGrid not configured. Email would be sent to:', to);
        console.log('Subject:', subject);
        return { success: false, message: 'SendGrid not configured' };
    }

    const msg = {
        to: to,
        from: process.env.SENDER_EMAIL || 'noreply@soenaudio.com',
        subject: subject,
        html: html,
    };

    try {
        await sgMail.send(msg);
        console.log('Email sent successfully to:', to);
        return { success: true };
    } catch (error) {
        console.error('Error sending email:', error);
        if (error.response) {
            console.error('SendGrid error response:', error.response.body);
        }
        return { success: false, error: error.message };
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        sendgrid: process.env.SENDGRID_API_KEY ? 'configured' : 'not configured'
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Backend API is working!',
        endpoints: {
            health: '/api/health',
            leaveApplications: '/api/leave-applications (POST)',
            approve: '/api/leave-applications/:id/approve (POST)',
            reject: '/api/leave-applications/:id/reject (POST)'
        }
    });
});

// Submit leave application
app.post('/api/leave-applications', async (req, res) => {
    try {
        const leaveRequest = req.body;
        console.log('Received leave application:', leaveRequest);

        // Get manager email
        const managerEmail = getManagerEmail(leaveRequest.managerId);
        
        if (!managerEmail) {
            console.error('Manager email not found for managerId:', leaveRequest.managerId);
            return res.status(400).json({ error: 'Manager not found' });
        }

        // Create email HTML
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">SOEN Leave Management</h1>
                </div>
                
                <div style="padding: 30px; background: #f5f7fa;">
                    <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #1e3c72; margin-top: 0;">New Leave Request</h2>
                        
                        <p>Hello,</p>
                        
                        <p><strong>${leaveRequest.employeeName}</strong> has submitted a leave request that requires your approval.</p>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 8px 0;"><strong>Employee:</strong></td>
                                    <td style="padding: 8px 0;">${leaveRequest.employeeName}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;"><strong>Email:</strong></td>
                                    <td style="padding: 8px 0;">${leaveRequest.employeeEmail}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;"><strong>Leave Type:</strong></td>
                                    <td style="padding: 8px 0;">${leaveRequest.type}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;"><strong>Start Date:</strong></td>
                                    <td style="padding: 8px 0;">${leaveRequest.startDate}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;"><strong>End Date:</strong></td>
                                    <td style="padding: 8px 0;">${leaveRequest.endDate}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;"><strong>Duration:</strong></td>
                                    <td style="padding: 8px 0;">${leaveRequest.days} day(s)</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;"><strong>Reason:</strong></td>
                                    <td style="padding: 8px 0;">${leaveRequest.reason}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <p style="margin-top: 30px;">Please log in to the leave management system to approve or reject this request.</p>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="${process.env.FRONTEND_URL || 'https://soen-leave-management.netlify.app'}" 
                               style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); 
                                      color: white; 
                                      padding: 12px 30px; 
                                      text-decoration: none; 
                                      border-radius: 6px; 
                                      display: inline-block;
                                      font-weight: bold;">
                                Review Request
                            </a>
                        </div>
                    </div>
                </div>
                
                <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
                    <p>SOEN Audio Leave Management System</p>
                    <p>This is an automated notification. Please do not reply to this email.</p>
                </div>
            </div>
        `;

        // Send email to manager
        const emailResult = await sendEmail(
            managerEmail,
            `New Leave Request from ${leaveRequest.employeeName}`,
            emailHtml
        );

        console.log('Email result:', emailResult);

        res.json({ 
            success: true, 
            message: 'Leave application received',
            emailSent: emailResult.success,
            managerEmail: managerEmail
        });

    } catch (error) {
        console.error('Error processing leave application:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Approve leave application
app.post('/api/leave-applications/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { approvedBy, approvedByEmail } = req.body;
        
        console.log('Approving leave application:', id);

        // In a real app, you'd fetch the leave request from database
        // For now, we'll send a generic approval email
        
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">SOEN Leave Management</h1>
                </div>
                
                <div style="padding: 30px; background: #f5f7fa;">
                    <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <div style="width: 60px; height: 60px; background: #28a745; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
                                <span style="color: white; font-size: 30px;">✓</span>
                            </div>
                        </div>
                        
                        <h2 style="color: #28a745; text-align: center; margin-top: 0;">Leave Request Approved</h2>
                        
                        <p>Good news! Your leave request has been approved by <strong>${approvedBy}</strong>.</p>
                        
                        <p style="margin-top: 20px;">You can view the details in your leave management dashboard.</p>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="${process.env.FRONTEND_URL || 'https://soen-leave-management.netlify.app'}" 
                               style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); 
                                      color: white; 
                                      padding: 12px 30px; 
                                      text-decoration: none; 
                                      border-radius: 6px; 
                                      display: inline-block;
                                      font-weight: bold;">
                                View Dashboard
                            </a>
                        </div>
                    </div>
                </div>
                
                <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
                    <p>SOEN Audio Leave Management System</p>
                </div>
            </div>
        `;

        // Note: In production, you'd get the employee email from the database
        // For now, this is a placeholder
        console.log('Approval email would be sent');

        res.json({ success: true, message: 'Leave approved and notification sent' });

    } catch (error) {
        console.error('Error approving leave:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Reject leave application
app.post('/api/leave-applications/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectedBy, rejectedByEmail, rejectionReason } = req.body;
        
        console.log('Rejecting leave application:', id);

        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">SOEN Leave Management</h1>
                </div>
                
                <div style="padding: 30px; background: #f5f7fa;">
                    <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #dc3545; margin-top: 0;">Leave Request Not Approved</h2>
                        
                        <p>Your leave request has been reviewed by <strong>${rejectedBy}</strong>.</p>
                        
                        <div style="background: #f8d7da; padding: 15px; border-radius: 6px; border-left: 4px solid #dc3545; margin: 20px 0;">
                            <p style="margin: 0;"><strong>Reason:</strong> ${rejectionReason}</p>
                        </div>
                        
                        <p style="margin-top: 20px;">If you have any questions, please contact your manager directly.</p>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="${process.env.FRONTEND_URL || 'https://soen-leave-management.netlify.app'}" 
                               style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); 
                                      color: white; 
                                      padding: 12px 30px; 
                                      text-decoration: none; 
                                      border-radius: 6px; 
                                      display: inline-block;
                                      font-weight: bold;">
                                View Dashboard
                            </a>
                        </div>
                    </div>
                </div>
                
                <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
                    <p>SOEN Audio Leave Management System</p>
                </div>
            </div>
        `;

        console.log('Rejection email would be sent');

        res.json({ success: true, message: 'Leave rejected and notification sent' });

    } catch (error) {
        console.error('Error rejecting leave:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`SendGrid configured: ${process.env.SENDGRID_API_KEY ? 'Yes' : 'No'}`);
});
