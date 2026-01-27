
import db from "../models/index.js";
import { QueryTypes } from "sequelize";

export const getPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Slug is required",
      });
    }

    // 🔹 CASE 1: FAQ PAGE
    if (slug === "faq") {
      const faqs = await db.sequelize.query(
        `
        SELECT id, question, answer, status, created_at, updated_at
        FROM faqs
        ORDER BY id ASC
        `,
        { type: QueryTypes.SELECT }
      );

      return res.json({
        success: true,
        type: "faq",
        data: faqs,
      });
    }

    // 🔹 CASE 2: ALL CMS PAGES
    if (slug === "all") {
      const pages = await db.sequelize.query(
        `
        SELECT
          id, title, slug, content, meta_title, meta_description, status, created_at, updated_at
        FROM pages
       
        ORDER BY id DESC
        `,
        { type: QueryTypes.SELECT }
      );

      return res.json({
        success: true,
        type: "all_pages",
        data: pages,
      });
    }

    // 🔹 CASE 3: SINGLE CMS PAGE BY SLUG
    const pages = await db.sequelize.query(
      `
      SELECT
        id, title, slug, content, meta_title, meta_description, status, created_at, updated_at
      FROM pages
      WHERE slug = :slug 
      `,
      {
        replacements: { slug },
        type: QueryTypes.SELECT,
      }
    );

    if (!pages.length) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    return res.json({
      success: true,
      type: "page",
      data: pages[0],
    });

  } catch (error) {
    console.error("Get Page Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const pagesedit = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, status } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID is required",
      });
    }

    // 🔹 Check page exists
    const page = await db.sequelize.query(
      `
      SELECT id FROM pages WHERE id = :id
      `,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
      }
    );

    if (!page.length) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    // 🔹 Update page
    await db.sequelize.query(
      `
      UPDATE pages
      SET
        title = :title,
        content = :content,
        status = :status
      WHERE id = :id
      `,
      {
        replacements: {
          id,
          title,
          content,
          status,
        },
        type: QueryTypes.UPDATE,
      }
    );

    return res.json({
      success: true,
      message: "Page updated successfully",
    });

  } catch (error) {
    console.error("Edit Page Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const faqaddedit = async (req, res) => {
  try {
    const { id, question, answer, status } = req.body;  
    if (id) {
      // Edit existing FAQ
      const faq = await db.sequelize.query(
        `
        SELECT id FROM faqs WHERE id = :id
        `,
        { replacements: { id },
          type: QueryTypes.SELECT,
        }
      );
      if (!faq.length) {
        return res.status(404).json({
          success: false,
          message: "FAQ not found",
        });
      }
      await db.sequelize.query(
        `
        UPDATE faqs
        SET question = :question,
            answer = :answer,
            status = :status,
            updated_at = NOW()
        WHERE id = :id
        `,
        {
          replacements: {
            id,
            question,
            answer,
            status,
          },
          type: QueryTypes.UPDATE,
        }
      );
      return res.json({
        success: true,
        message: "FAQ updated successfully",
      });
    }
    // Add new FAQ
    await db.sequelize.query(
      `
      INSERT INTO faqs (question, answer, status, created_at, updated_at)
      VALUES (:question, :answer, :status, NOW(), NOW())
      `,
      {
        replacements: {
          question,
          answer,
          status,
        },
        type: QueryTypes.INSERT,
      }
    );
    return res.json({
      success: true,
      message: "FAQ added successfully",
    });
  } catch (error) {
    console.error("FAQ Add/Edit Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
///////////////////////////////////
export const Faqsdetail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID is required",
      });
    }
    const faq = await db.sequelize.query(
      `
      SELECT id, question, answer, status, created_at, updated_at
      FROM faqs
      WHERE id = :id
      `,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
      }
    );
    if (!faq.length) {
      return res.status(404).json({
        success: false,
        message: "FAQ not found",
      });
    }
    return res.json({
      success: true,
      data: faq[0],
    });
  } catch (error) {
    console.error("FAQ Detail Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};