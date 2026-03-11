import express from 'express';
import { createServer as createViteServer } from 'vite';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  AlignmentType, 
  VerticalAlign,
  BorderStyle,
  ImageRun,
  Header,
  Footer
} from 'docx';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  fs.writeFileSync('express_started.txt', 'Started at ' + new Date().toISOString());

  // Database setup
  const db = await open({
    filename: 'acts.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS acts (
      id TEXT PRIMARY KEY,
      actNumber INTEGER,
      actDate TEXT,
      contractNumber TEXT,
      contractDate TEXT,
      updNumber TEXT,
      updDate TEXT,
      objectName TEXT,
      deliveryTerm TEXT,
      actualDeliveryDate TEXT,
      expertise TEXT,
      penalty TEXT,
      customerName TEXT,
      customerShortName TEXT,
      customerRep TEXT,
      customerBasis TEXT,
      customerRepShort TEXT,
      supplierName TEXT,
      supplierShortName TEXT,
      supplierRep TEXT,
      supplierBasis TEXT,
      supplierRepShort TEXT,
      totalAmount REAL,
      vatRate REAL,
      vatAmount REAL,
      items TEXT,
      updDetails TEXT,
      signatureImage TEXT,
      stampImage TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', backend: 'express' });
  });

  app.get('/api/acts', async (req, res) => {
    try {
      const acts = await db.all('SELECT * FROM acts ORDER BY createdAt DESC');
      const parsedActs = acts.map(act => ({
        ...act,
        items: JSON.parse(act.items),
        updDetails: act.updDetails ? JSON.parse(act.updDetails) : []
      }));
      res.json(parsedActs);
    } catch (error) {
      res.status(500).json({ detail: (error as Error).message });
    }
  });

  app.post('/api/acts', async (req, res) => {
    try {
      const act = req.body;
      await db.run(`
        INSERT OR REPLACE INTO acts (
          id, actNumber, actDate, contractNumber, contractDate, updNumber, updDate,
          objectName, deliveryTerm, actualDeliveryDate, expertise, penalty,
          customerName, customerShortName, customerRep, customerBasis, customerRepShort,
          supplierName, supplierShortName, supplierRep, supplierBasis, supplierRepShort,
          totalAmount, vatRate, vatAmount, items, updDetails, signatureImage, stampImage
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        act.id, act.actNumber, act.actDate, act.contractNumber, act.contractDate, act.updNumber, act.updDate,
        act.objectName, act.deliveryTerm, act.actualDeliveryDate, act.expertise, act.penalty,
        act.customerName, act.customerShortName, act.customerRep, act.customerBasis, act.customerRepShort,
        act.supplierName, act.supplierShortName, act.supplierRep, act.supplierBasis, act.supplierRepShort,
        act.totalAmount, act.vatRate, act.vatAmount,
        JSON.stringify(act.items),
        act.updDetails ? JSON.stringify(act.updDetails) : null,
        act.signatureImage,
        act.stampImage
      ]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ detail: (error as Error).message });
    }
  });

  // DOCX Generation Logic
  const generateDocx = async (act: any) => {
    const months = [
      "января", "февраля", "марта", "апреля", "мая", "июня",
      "июля", "августа", "сентября", "октября", "ноября", "декабря"
    ];

    const formatDateRu = (dateStr: string) => {
      if (!dateStr) return "«___» ____________ 20__ г.";
      const cleanStr = dateStr.replace("г.", "").replace("г", "").trim();
      
      try {
        let date: Date;
        if (cleanStr.includes('.')) {
          const [d, m, y] = cleanStr.split('.');
          date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        } else {
          date = new Date(cleanStr);
        }
        
        if (isNaN(date.getTime())) return `«${dateStr}» г.`;
        
        return `«${date.getDate().toString().padStart(2, '0')}» ${months[date.getMonth()]} ${date.getFullYear()} г.`;
      } catch (e) {
        return `«${dateStr}» г.`;
      }
    };

    const numToWordsRu = (n: number) => {
      // Very simplified version for now, could be improved
      return `${n.toLocaleString('ru-RU')} руб.`;
    };

    const tableHeader = new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "№ п/п", bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "№ спец.", bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Наименование", bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Ед. изм.", bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Кол-во", bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Цена за ед.", bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Сумма", bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Страна", bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
      ],
    });

    const tableRows = act.items.map((item: any, i: number) => (
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (i + 1).toString(), size: 16 })], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.specNumber || '-', size: 16 })], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.name, size: 16 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.unit, size: 16 })], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.quantity.toString(), size: 16 })], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.priceWithVat.toLocaleString('ru-RU'), size: 16 })], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.totalWithVat.toLocaleString('ru-RU'), size: 16 })], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.country || 'Россия', size: 16 })], alignment: AlignmentType.CENTER })] }),
        ],
      })
    ));

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 720, // 0.5 inch
              bottom: 720,
              left: 1008, // 0.7 inch
              right: 720,
            },
          },
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: `АКТ приемки-передачи товара №${act.actNumber}`, bold: true, size: 28 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Дата составления и подписания Акта Поставщиком", bold: true, size: 22 })] }),
                      new Paragraph({ children: [new TextRun({ text: formatDateRu(act.actDate), size: 22 })] }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Дата составления и подписания Акта Заказчиком", bold: true, size: 22 })], alignment: AlignmentType.RIGHT }),
                      new Paragraph({ children: [new TextRun({ text: "«___» ____________ 2026 г.", size: 22 })], alignment: AlignmentType.RIGHT }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ spacing: { before: 240 } }),
          new Paragraph({
            children: [new TextRun({ text: `${act.customerName} (${act.customerShortName}), именуемое в дальнейшем «Заказчик», в лице ${act.customerRep}, действующей на основании ${act.customerBasis}, с одной стороны, и ${act.supplierName} (${act.supplierShortName}), именуемое в дальнейшем «Поставщик», в лице ${act.supplierRep}, действующей на основании ${act.supplierBasis}, с другой стороны, совместно именуемые «Стороны», составили настоящий акт о нижеследующем:`, size: 22 })],
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: 720 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `1. В соответствии с Договором № ${act.contractNumber} от ${formatDateRu(act.contractDate)} Поставщик выполнил обязательства по поставке товаров.`, size: 22 })],
            indent: { firstLine: 720 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [tableHeader, ...tableRows],
          }),
          new Paragraph({ spacing: { before: 240 } }),
          new Paragraph({
            children: [new TextRun({ text: `Итого к оплате: ${act.totalAmount.toLocaleString('ru-RU')} руб.`, bold: true, size: 22 })],
            alignment: AlignmentType.RIGHT,
          }),
          // Signatures
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Заказчик:", bold: true, size: 22 })] }),
                      new Paragraph({ children: [new TextRun({ text: `${act.customerShortName}\n\n_________________ / ${act.customerRepShort} /`, size: 22 })] }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Поставщик:", bold: true, size: 22 })] }),
                      new Paragraph({ children: [new TextRun({ text: `${act.supplierShortName}\n\n`, size: 22 })] }),
                      ...(act.signatureImage ? [
                        new Paragraph({
                          children: [
                            new ImageRun({
                              data: Buffer.from(act.signatureImage.split(',')[1], 'base64'),
                              transformation: { width: 100, height: 50 },
                            }),
                          ],
                        }),
                      ] : []),
                      new Paragraph({ children: [new TextRun({ text: `_________________ / ${act.supplierRepShort} /`, size: 22 })] }),
                      ...(act.stampImage ? [
                        new Paragraph({
                          children: [
                            new ImageRun({
                              data: Buffer.from(act.stampImage.split(',')[1], 'base64'),
                              transformation: { width: 100, height: 100 },
                            }),
                          ],
                        }),
                      ] : []),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }],
    });

    return await Packer.toBuffer(doc);
  };

  app.post('/api/generate-docx', async (req, res) => {
    try {
      const buffer = await generateDocx(req.body);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename=act_${req.body.actNumber}.docx`);
      res.send(buffer);
    } catch (error) {
      console.error(error);
      res.status(500).json({ detail: (error as Error).message });
    }
  });

  app.post('/api/acts/:id/docx', async (req, res) => {
    try {
      const buffer = await generateDocx(req.body);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename=act_${req.body.actNumber}.docx`);
      res.send(buffer);
    } catch (error) {
      console.error(error);
      res.status(500).json({ detail: (error as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
