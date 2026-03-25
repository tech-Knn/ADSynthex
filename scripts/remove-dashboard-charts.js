const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../components/Dashboard/CostRevenueMapping.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove imports
content = content.replace(/import { Bar, Line } from 'react-chartjs-2';\nimport \{\n  Chart as ChartJS,[\s\S]*?\} from 'chart\.js';\n\n\/\/ Register Chart\.js components\nChartJS\.register\([\s\S]*?\);\n/g, '');

// 2. Remove chartData definitions
content = content.replace(/  \/\/ Chart data for cost vs revenue[\s\S]*?  const roiChartOptions = \{[\s\S]*?  \};\n/g, '');

// 3. Keep the toggle switch but remove the Profitability Overview and Charts JSX
const profitabilityRegex = /      \{\/\* Profitability Overview \*\/\}[\s\S]*?\{\/\* Charts \*\/\}[\s\S]*?      \)\}\n/g;

// Create a new Title component with the switch for the table
content = content.replace(profitabilityRegex, '');

// Update the Detailed Table card to include the switch
const detailedTableRegex = /      \{\/\* Detailed Table \*\/\}[\s\S]*?<Card \n          title=\{`Campaign Details \(\$\{data\.length\} campaigns\)`\}/g;

const newDetailedTableTitle = `      {/* Detailed Table */}
      {data.length > 0 && (
        <Card 
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Campaign Details ({data.length} campaigns)</span>
              <Space>
                <Switch 
                  checkedChildren="Detailed" 
                  unCheckedChildren="Summary" 
                  checked={detailedView}
                  onChange={setDetailedView}
                />
              </Space>
            </div>
          }
          style={{ display: detailedView ? 'block' : 'none' }}`;

content = content.replace(detailedTableRegex, newDetailedTableTitle);

// Wait, the previous logic checked `{detailedView && data.length > 0 && (`
// My replacement changes the `{detailedView && data.length > 0 && (` to `{data.length > 0 && (` then adds display: none.
// But the original regex matched `{detailedView && data.length > 0 && (`
content = content.replace(/\{detailedView && data\.length > 0 && \(/g, '{data.length > 0 && (');

fs.writeFileSync(filePath, content);
console.log('Finished removing charts from CostRevenueMapping.tsx');
