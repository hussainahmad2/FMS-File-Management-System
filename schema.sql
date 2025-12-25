-- =====================================================
-- Admin Console / File Management System
-- Database Schema for MySQL / MariaDB
-- =====================================================

-- =====================================================
-- TABLE: users
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'employee', -- 'superadmin', 'admin', 'staff', 'employee'
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'suspended'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_username (username),
    INDEX idx_users_role (role),
    INDEX idx_users_status (status)
) COMMENT='User accounts with authentication credentials and role-based access control';

-- =====================================================
-- TABLE: user_settings
-- =====================================================
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INT PRIMARY KEY,
    theme VARCHAR(20) DEFAULT 'light',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    language VARCHAR(10) DEFAULT 'en',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) COMMENT='User-specific application settings';

-- =====================================================
-- TABLE: folders
-- =====================================================
CREATE TABLE IF NOT EXISTS folders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id INT,
    owner_id INT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    path TEXT,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_folders_parent_id (parent_id),
    INDEX idx_folders_owner_id (owner_id),
    INDEX idx_folders_is_deleted (is_deleted),
    INDEX idx_folders_parent_deleted (parent_id, is_deleted)
) COMMENT='Hierarchical folder structure supporting unlimited nesting';

-- =====================================================
-- TABLE: files
-- =====================================================
CREATE TABLE IF NOT EXISTS files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT NOT NULL,
    folder_id INT,
    size INT NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    path TEXT NOT NULL,
    created_by INT,
    is_starred BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP NULL, -- For trash retention policy
    last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_files_folder_id (folder_id),
    INDEX idx_files_created_by (created_by),
    INDEX idx_files_is_starred (is_starred),
    INDEX idx_files_is_deleted (is_deleted),
    INDEX idx_files_last_accessed (last_accessed_at DESC),
    INDEX idx_files_folder_deleted (folder_id, is_deleted)
) COMMENT='File metadata - actual files stored in filesystem';

-- =====================================================
-- TABLE: permissions
-- =====================================================
CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id INT,
    folder_id INT,
    user_id INT NOT NULL,
    granted_by INT NOT NULL,
    access_level VARCHAR(20) NOT NULL DEFAULT 'view', -- 'view', 'edit'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_permissions_user (user_id),
    INDEX idx_permissions_file (file_id),
    INDEX idx_permissions_folder (folder_id)
) COMMENT='Access Control List for sharing files and folders';

-- =====================================================
-- TABLE: audit_logs
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id INT,
    details TEXT,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_logs_user_id (user_id),
    INDEX idx_audit_logs_action (action),
    INDEX idx_audit_logs_target_type (target_type),
    INDEX idx_audit_logs_created_at (created_at DESC),
    INDEX idx_audit_logs_target (target_type, target_id),
    INDEX idx_audit_logs_ip_address (ip_address)
) COMMENT='Comprehensive audit trail of all system actions';
