export interface TestDataset {
  name: string;
  description: string;
  rows: number;
  columns: Array<{
    name: string;
    type: 'string' | 'number' | 'date' | 'email' | 'phone' | 'uuid';
    semanticType?: string;
    nullable?: boolean;
  }>;
  data: Array<Record<string, any>>;
}

export class TestDataGenerator {
  static generateLargeDataset(rows: number): TestDataset {
    const data: Array<Record<string, any>> = [];

    for (let i = 0; i < rows; i++) {
      data.push({
        customer_id: `cust_${String(i).padStart(8, '0')}`,
        email: `user${i}@example.com`,
        phone: this.generatePhoneNumber(),
        name: this.generateName(),
        purchase_amount: Math.round(Math.random() * 1000 * 100) / 100,
        timestamp: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
        product_category: this.randomChoice(['electronics', 'clothing', 'books', 'home', 'sports']),
        region: this.randomChoice(['US', 'EU', 'APAC', 'LATAM'])
      });
    }

    return {
      name: `large_dataset_${rows}`,
      description: `Generated dataset with ${rows} rows for performance testing`,
      rows,
      columns: [
        { name: 'customer_id', type: 'string', semanticType: 'identity.customer' },
        { name: 'email', type: 'email', semanticType: 'contact.email' },
        { name: 'phone', type: 'phone', semanticType: 'contact.phone' },
        { name: 'name', type: 'string', semanticType: 'identity.person' },
        { name: 'purchase_amount', type: 'number', semanticType: 'transaction.amount' },
        { name: 'timestamp', type: 'date', semanticType: 'event.timestamp' },
        { name: 'product_category', type: 'string', semanticType: 'product.category' },
        { name: 'region', type: 'string', semanticType: 'location.region' }
      ],
      data
    };
  }

  static generateMessyDataset(): TestDataset {
    return {
      name: 'messy_sales',
      description: 'Dataset with encoding issues, missing values, and type mismatches',
      rows: 1000,
      columns: [
        { name: 'customer_id', type: 'string', nullable: true },
        { name: 'email', type: 'email', nullable: true },
        { name: 'purchase_amount', type: 'string' }, // String but should be number
        { name: 'timestamp', type: 'string' } // Various date formats
      ],
      data: Array.from({ length: 1000 }, (_, i) => ({
        customer_id: i % 10 === 0 ? null : `cust_${i}`,
        email: i % 7 === 0 ? 'invalid-email' : `user${i}@example.com`,
        purchase_amount: i % 5 === 0 ? 'N/A' : String(Math.random() * 1000),
        timestamp: this.randomChoice([
          new Date().toISOString(),
          '2023-12-31',
          '12/31/2023',
          '31-Dec-2023',
          'invalid-date'
        ])
      }))
    };
  }

  static generateUnicodeDataset(): TestDataset {
    const names = [
      'محمد احمد', // Arabic
      '张三', // Chinese
      'יוסי כהן', // Hebrew
      'José María', // Spanish with accents
      'Москва Иванов', // Cyrillic
      'Αλέξανδρος', // Greek
      'हरीश कुमार' // Hindi
    ];

    return {
      name: 'unicode_names',
      description: 'Dataset with Unicode characters in various scripts',
      rows: names.length * 100,
      columns: [
        { name: 'name', type: 'string', semanticType: 'identity.person' },
        { name: 'email', type: 'email' },
        { name: 'country', type: 'string' }
      ],
      data: Array.from({ length: names.length * 100 }, (_, i) => ({
        name: names[i % names.length],
        email: `user${i}@example.com`,
        country: this.randomChoice(['SA', 'CN', 'IL', 'ES', 'RU', 'GR', 'IN'])
      }))
    };
  }

  static generateLegacyDataset(): TestDataset {
    return {
      name: 'legacy_cobol',
      description: 'COBOL-style dataset with 8-character column names',
      rows: 500,
      columns: [
        { name: 'CUSTNO', type: 'string', semanticType: 'identity.customer' },
        { name: 'CUSTNAME', type: 'string', semanticType: 'identity.person' },
        { name: 'EMAILADR', type: 'email', semanticType: 'contact.email' },
        { name: 'PHONENUM', type: 'phone', semanticType: 'contact.phone' },
        { name: 'PURCHAMT', type: 'number', semanticType: 'transaction.amount' },
        { name: 'TXNDATE', type: 'date', semanticType: 'event.timestamp' }
      ],
      data: Array.from({ length: 500 }, (_, i) => ({
        CUSTNO: String(i).padStart(8, '0'),
        CUSTNAME: this.generateName().substring(0, 20), // Truncated like COBOL
        EMAILADR: `user${i}@company.com`,
        PHONENUM: this.generatePhoneNumber(),
        PURCHAMT: Math.round(Math.random() * 10000 * 100) / 100,
        TXNDATE: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }))
    };
  }

  private static generatePhoneNumber(): string {
    const formats = [
      '+1-555-XXX-XXXX',
      '(555) XXX-XXXX',
      '555.XXX.XXXX',
      '+44 20 XXXX XXXX',
      '+33 1 XX XX XX XX'
    ];

    let format = this.randomChoice(formats);

    return format.replace(/X/g, () => Math.floor(Math.random() * 10).toString());
  }

  private static generateName(): string {
    const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

    return `${this.randomChoice(firstNames)} ${this.randomChoice(lastNames)}`;
  }

  private static randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  static writeDatasetToCSV(dataset: TestDataset): string {
    const headers = dataset.columns.map(col => col.name).join(',');
    const rows = dataset.data.map(row =>
      dataset.columns.map(col => {
        const value = row[col.name];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) return `"${value}"`;
        return String(value);
      }).join(',')
    );

    return [headers, ...rows].join('\n');
  }
}