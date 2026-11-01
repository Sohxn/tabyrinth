# Platform Security After Action Review (AAR) - Reusable Prompt Template

## Overview
This prompt template enables you to conduct a comprehensive security audit of any software project, generating an After Action Review with actionable security solutions at three levels: Good, Better, and Best.

---

## The Master Prompt

I need you to conduct a comprehensive Platform Security After Action Review (AAR) for my project. Follow these exact steps:

## Step 1: Initial Discovery and Analysis

First, analyze the codebase systematically for security vulnerabilities:

1. **Security Vulnerability Scan**
  - Search for hardcoded credentials, API keys, secrets
  - Identify authentication and authorization implementations
  - Look for input validation and sanitization
  - Check for command execution patterns
  - Review CORS and security headers configuration
  - Analyze file upload handling
  - Check for SQL injection possibilities
  - Review API endpoint security

2. **Security DevOps and Infrastructure**
  - Analyze secrets management
  - Review security monitoring and logging

3. **Security Testing and Compliance**
  - Check for existing security testing
  - OWASP Top 10 compliance check

## Step 2: Generate the Security AAR Document

Create a markdown file with the following structure:

# Platform Security After Action Review

**Date**: [Current Date]
**Platform**: [Project Name]
**Review Type**: Security Audit
**Severity**: CRITICAL

## Executive Summary
[Brief overview of security findings, overall risk score, and critical issues]

## 1. Security Analysis - Score: X/10 🔒

### Critical Vulnerabilities Found

#### 1.1 [Vulnerability Name]
- [Detailed description of the security flaw]
- [Evidence with file paths and line numbers]
- [Exploit potential and impact]

**Solutions:**

**Good Solution - [Quick Security Patch]**
- **Implementation**: [Brief description]
- **Components**:
  1. [Component 1]
  2. [Component 2]
- **Code Example**:
  [language]
  // Actual secure code implementation

- **Expected Results**:
  - [Result 1]
- **Pros**: [List pros]
- **Cons**: [List cons]

**Better Solution - [Proper Security Implementation]**
[Same structure as above with more comprehensive secure solution]

**Best Solution - [Enterprise-Grade Security Fix]**
[Same structure as above with most robust, hardened solution]

[Repeat for each vulnerability]

## Recommendations Priority Matrix
[Table of all security recommendations sorted by risk level, priority, and effort]


## Step 3: Solution Requirements

For EVERY security issue identified, create exactly 3 solutions following these rules:

### Good Solution (Quick Patch)
- Addresses the immediate vulnerability
- Uses existing security libraries and secure patterns
- Include actual, working code examples
- Must pass basic security scans

### Better Solution (Proper Implementation)
- Implements industry security best practices
- Includes security monitoring and threat logging
- Comprehensive code examples with secure error handling
- Must pass penetration testing

### Best Solution (Enterprise-Grade)
- Implements cutting-edge security practices
- Includes AI/ML-powered threat detection where applicable
- Production-grade secure code with full auditability
- Must pass enterprise security audits
- Future-proof against emerging attack vectors

## Step 4: Solution Constraints

All solutions must:

1. **Be Brutally Honest**
  - Call out insecure practices directly
  - Don't sugarcoat security vulnerabilities

2. **Be Security-First**
  - Every solution must consider security implications deeply
  - Include strict input validation
  - Implement proper authentication/authorization
  - Address OWASP Top 10 guidelines

3. **Pass Security Audits**
  - Solutions must withstand penetration testing
  - Include comprehensive security headers
  - Implement rate limiting and brute-force protection
  - Use secure defaults (deny-by-default)

## Step 5: Code Example Requirements

Every security code example must:
- Be complete and runnable
- Handle errors securely without leaking sensitive system information
- Follow secure coding conventions
- Be tested against the identified vulnerability

## Step 6: Output Format

- Place all security solutions directly under each vulnerability
- Focus on secure implementation details
- Include security configuration changes needed
- Reference specific files in the project to apply patches

## Additional Context:
- Project Type: [Web App/API/Mobile/Desktop]
- Tech Stack: [List all technologies]
- Security Requirements: [Compliance needs, e.g., HIPAA, SOC2, PCI-DSS]

---

## How to Use This Prompt

1. **Preparation**:
  - Have your complete codebase accessible
  - Know your security compliance needs

2. **Execution**:
  - Copy the master prompt above
  - Fill in the placeholders in "Additional Context"
  - Run the security analysis

3. **Implementation Guidance**:
  - Start with "Good" solutions for critical vulnerabilities immediately
  - Plan "Better" solutions for the next sprint
  - Reserve "Best" solutions for major architecture upgrades

---

## Example Follow-up Prompts

After the initial Security AAR, you can use these prompts:

1. "Focus deeper on the authentication system and provide more detailed solutions"
2. "Create penetration test cases for each security vulnerability"
3. "Generate a secure migration plan from Good to Better to Best solutions"
4. "Provide secure Docker configurations for each solution level"
5. "Add security monitoring and intrusion alerting configurations"

---

## Customization Options

### For Different Project Types:

**API-First Projects**:
- Include API rate limiting strategies
- Focus on endpoint authorization

**Microservices**:
- Add service mesh security analysis
- Focus on zero-trust inter-service communication

### For Different Compliance Needs:

**HIPAA Compliance**:
- Add PHI data handling analysis
- Include strict audit logging requirements
- Focus on encryption at rest and in transit

**PCI-DSS Compliance**:
- Add payment data handling restrictions
- Include network segmentation rules
- Focus on cryptographic key management

**SOC 2 Compliance**:
- Add access control analysis
- Include security change management
- Focus on intrusion detection and availability

---

## Red Flags to Watch For

If your AAR reveals these, prioritize immediate fixes:
- Hardcoded credentials or API keys
- No authentication on sensitive endpoints
- SQL or NoSQL injection vulnerabilities
- Unencrypted sensitive data
- No rate limiting or throttling
- Missing security headers (CSP, HSTS, X-Frame-Options)
- Outdated dependencies with known CVEs
- Missing or bypassable input validation
- Broad or wildcard CORS policies
- No security logging/monitoring