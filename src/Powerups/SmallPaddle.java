/**
To change this license header, choose License Headers in Project Properties.
To change this template file, choose Tools | Templates
and open the template in the editor.
*/

package Powerups;

import Game.Game;
import Game.PowerUp;
import java.awt.Graphics;
import java.awt.Point;

/**
 
 @author schmidmichae
 */
public class SmallPaddle extends PowerUp 
{
   public static int HEIGHT_DECREASE_AMOUNT = 10;
   private int oldHeight;
   
   public SmallPaddle(Point location)
   {
      this.location = new Point(location);
      icon = SmallPaddle.class.getResource("/res/powerupImages/ShrinkPaddle.png");
   }
   
   @Override
   public void tick(Game game)
   {
      super.tick(game);      
   }

   @Override
   public void init(Game game)
   {
      oldHeight = player.getPaddleHeight();
      player.setPaddleHeight(oldHeight - HEIGHT_DECREASE_AMOUNT);
   }

   @Override
   public void end(Game game)
   {
      player.setPaddleHeight(oldHeight);
   }

   @Override
   public void draw(Game game, Graphics w)
   {
      if(!running)
      {
         
      }
   }

}
